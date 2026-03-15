import { EventSource } from "eventsource";
import { Client } from "discord.js";
import fs from "fs";
import path from "path";
import { TrackedValidator } from "../db/models/TrackedValidator";
import { handleSlotEvent, SlotEvent, sendSkipAlert, SkipEvent } from "./notification";
import { formatNodeId, fetchAllValidators } from "../utils/validator";
import { uploadToGitHub } from "./github-upload";

const SSE_URL = "https://proxy-mn.gmonads.com/sse";
const SLOTS_DATA_DIR = path.join(process.cwd(), "slotsData");

// Slot archive state
let currentEpoch: string | null = null;
let currentWriteStream: fs.WriteStream | null = null;

function ensureSlotsDir(): void {
  if (!fs.existsSync(SLOTS_DATA_DIR)) {
    fs.mkdirSync(SLOTS_DATA_DIR, { recursive: true });
  }
}

function getEpochFromEvent(parsed: any): string | null {
  if (parsed.type === "finalized_block") {
    return parsed.payload?.epoch != null ? String(parsed.payload.epoch) : null;
  }
  if (parsed.type === "timeout") {
    return parsed.payload?.Epoch != null ? String(parsed.payload.Epoch) : null;
  }
  return null;
}

function archiveEvent(parsed: any): void {
  const epoch = getEpochFromEvent(parsed);
  if (epoch === null) return;

  if (epoch !== currentEpoch) {
    // Close previous stream and upload to GitHub
    if (currentWriteStream && currentEpoch !== null) {
      const closedEpoch = currentEpoch;
      currentWriteStream.end(() => {
        const filePath = path.join(SLOTS_DATA_DIR, `slots-${closedEpoch}.jsonl`);
        console.log(`📦 Closed archive for epoch ${closedEpoch}, uploading to GitHub...`);
        uploadToGitHub(filePath).then((result) => {
          if (!result.success) {
            console.error(`❌ GitHub upload failed for epoch ${closedEpoch}: ${result.error}`);
          }
        });
      });
    }

    currentEpoch = epoch;
    ensureSlotsDir();
    const filePath = path.join(SLOTS_DATA_DIR, `slots-${epoch}.jsonl`);
    currentWriteStream = fs.createWriteStream(filePath, { flags: "a" });
    console.log(`📦 Archiving slots to ${filePath}`);
  }

  currentWriteStream!.write(JSON.stringify(parsed) + "\n");
}

// In-memory cache of tracked validators for fast lookups
// Map<nodeId, Array<{ channelId, validatorName, commission, batchMode }>>
let trackedMap = new Map<string, Array<{
  channelId: string;
  validatorName: string;
  validatorLogo: string;
  commission: number;
  batchMode: string;
  addedBy: string;
}>>();

export async function refreshTrackedCache(): Promise<void> {
  const all = await TrackedValidator.find({});
  const newMap = new Map<string, typeof trackedMap extends Map<string, infer V> ? V : never>();

  // Build a logo lookup from the validators API
  const validators = await fetchAllValidators();
  const logoMap = new Map<string, string>();
  for (const v of validators) {
    if (v.logo) logoMap.set(v.nodeId, v.logo);
  }

  for (const doc of all) {
    const existing = newMap.get(doc.nodeId) || [];
    existing.push({
      channelId: doc.channelId,
      validatorName: doc.validatorName,
      validatorLogo: logoMap.get(doc.nodeId) || "",
      commission: doc.commission,
      batchMode: doc.batchMode,
      addedBy: doc.addedBy,
    });
    newMap.set(doc.nodeId, existing);
  }

  trackedMap = newMap;
  console.log(`📋 Tracking ${all.length} validator-channel pairs (${newMap.size} unique validators)`);
  for (const [nodeId, trackers] of newMap) {
    console.log(`   → ${trackers[0]!.validatorName || "unnamed"} (${formatNodeId(nodeId)}) in ${trackers.length} channel(s)`);
  }
}

function processSSEMessage(client: Client, data: string): void {
  let parsed: any;
  try {
    parsed = JSON.parse(data);
  } catch {
    return; // Not JSON (e.g., "Connected to stream", "heartbeat")
  }

  // Handle finalized blocks
  if (parsed.type === "finalized_block") {
    const { author, block_num, round, epoch } = parsed.payload;
    if (!author) return;

    const trackers = trackedMap.get(author);
    if (!trackers || trackers.length === 0) return;

    const name = trackers[0]!.validatorName || formatNodeId(author);
    console.log(`🎰 TRACKED HIT: ${name} produced block #${block_num} (round ${round}, epoch ${epoch})`);
    console.log(`   Dispatching to ${trackers.length} channel(s)`);

    for (const tracker of trackers) {
      const slotEvent: SlotEvent = {
        nodeId: author,
        validatorName: tracker.validatorName,
        validatorLogo: tracker.validatorLogo,
        commission: tracker.commission,
        blockNum: typeof block_num === "string" ? parseInt(block_num) : block_num,
        round: String(round),
        epoch: String(epoch),
        timestamp: Date.now(),
      };

      handleSlotEvent(client, tracker.channelId, tracker.batchMode, slotEvent);
    }
  }

  // Handle timeouts (slot skips)
  if (parsed.type === "timeout") {
    const { AuthorNodeID, Round, Epoch } = parsed.payload;
    if (!AuthorNodeID) return;

    const trackers = trackedMap.get(AuthorNodeID);
    if (!trackers || trackers.length === 0) return;

    const notifiedUsers = new Set<string>();
    for (const tracker of trackers) {
      if (notifiedUsers.has(tracker.addedBy)) continue;
      notifiedUsers.add(tracker.addedBy);

      const skipEvent: SkipEvent = {
        nodeId: AuthorNodeID,
        validatorName: tracker.validatorName,
        validatorLogo: tracker.validatorLogo,
        round: String(Round),
        epoch: String(Epoch),
        timestamp: Date.now(),
      };

      sendSkipAlert(client, tracker.addedBy, skipEvent);
    }
  }
}

export function startSSEListener(client: Client): void {
  let reconnectDelay = 1000;
  let blockCount = 0;
  let trackedHits = 0;

  function connect() {
    console.log("📡 Connecting to SSE stream...");
    const es = new EventSource(SSE_URL);

    es.onopen = () => {
      console.log("📡 SSE connected");
      reconnectDelay = 1000;
    };

    es.onmessage = (event: MessageEvent) => {
      const raw = String(event.data);

      // Parse JSON
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        return; // "Connected to stream", "heartbeat", etc.
      }

      // Archive all slot events to JSONL files by epoch
      archiveEvent(data);

      // Log block count periodically
      if (data.type === "finalized_block") {
        blockCount++;
        if (blockCount === 1 || blockCount % 500 === 0) {
          console.log(`📡 SSE alive — ${blockCount} blocks received, ${trackedHits} tracked hits`);
        }
      }

      processSSEMessage(client, raw);
    };

    es.onerror = () => {
      console.error(`📡 SSE error, reconnecting in ${reconnectDelay}ms...`);
      es.close();
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    };
  }

  connect();

  // Periodically refresh the tracked validator cache (every 2 min)
  setInterval(refreshTrackedCache, 120_000);
}
