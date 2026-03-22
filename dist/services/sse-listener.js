"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTrackedCache = refreshTrackedCache;
exports.startSSEListener = startSSEListener;
const eventsource_1 = require("eventsource");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TrackedValidator_1 = require("../db/models/TrackedValidator");
const notification_1 = require("./notification");
const validator_1 = require("../utils/validator");
const tips_1 = require("./tips");
const github_upload_1 = require("./github-upload");
const epoch_summary_1 = require("./epoch-summary");
const SSE_URL = "https://proxy-mn.gmonads.com/sse";
const SLOTS_DATA_DIR = path_1.default.join(process.cwd(), "slotsData");
// Slot archive state
let currentEpoch = null;
let currentWriteStream = null;
let discordClient = null;
function ensureSlotsDir() {
    if (!fs_1.default.existsSync(SLOTS_DATA_DIR)) {
        fs_1.default.mkdirSync(SLOTS_DATA_DIR, { recursive: true });
    }
}
function getEpochFromEvent(parsed) {
    if (parsed.type === "finalized_block") {
        return parsed.payload?.epoch != null ? String(parsed.payload.epoch) : null;
    }
    if (parsed.type === "timeout") {
        return parsed.payload?.Epoch != null ? String(parsed.payload.Epoch) : null;
    }
    return null;
}
async function archiveEvent(parsed) {
    const epoch = getEpochFromEvent(parsed);
    if (epoch === null)
        return;
    // Enrich finalized blocks with priority fee data
    if (parsed.type === "finalized_block" && parsed.payload?.block_num != null) {
        const blockNum = typeof parsed.payload.block_num === "string"
            ? parseInt(parsed.payload.block_num)
            : parsed.payload.block_num;
        try {
            const tips = await (0, tips_1.getBlockTips)(blockNum);
            if (tips) {
                parsed.payload.priority_fees_mon = tips.totalTipsMon;
                parsed.payload.tx_count = tips.txCount;
            }
        }
        catch {
            // Don't block archiving if tip fetch fails
        }
    }
    if (epoch !== currentEpoch) {
        // Close previous stream and upload to GitHub
        if (currentWriteStream && currentEpoch !== null) {
            const closedEpoch = currentEpoch;
            currentWriteStream.end(() => {
                const filePath = path_1.default.join(SLOTS_DATA_DIR, `slots-${closedEpoch}.jsonl`);
                console.log(`📦 Closed archive for epoch ${closedEpoch}, uploading to GitHub...`);
                (0, github_upload_1.uploadToGitHub)(filePath).then((result) => {
                    if (!result.success) {
                        console.error(`❌ GitHub upload failed for epoch ${closedEpoch}: ${result.error}`);
                    }
                });
                // Send epoch summary DMs
                if (discordClient) {
                    (0, epoch_summary_1.sendEpochSummaries)(discordClient, closedEpoch);
                }
            });
        }
        currentEpoch = epoch;
        ensureSlotsDir();
        const filePath = path_1.default.join(SLOTS_DATA_DIR, `slots-${epoch}.jsonl`);
        currentWriteStream = fs_1.default.createWriteStream(filePath, { flags: "a" });
        console.log(`📦 Archiving slots to ${filePath}`);
    }
    currentWriteStream.write(JSON.stringify(parsed) + "\n");
}
// In-memory cache of tracked validators for fast lookups
// Map<nodeId, Array<{ channelId, validatorName, commission, batchMode }>>
let trackedMap = new Map();
async function refreshTrackedCache() {
    const all = await TrackedValidator_1.TrackedValidator.find({});
    const newMap = new Map();
    // Build a logo lookup from the validators API
    const validators = await (0, validator_1.fetchAllValidators)();
    const logoMap = new Map();
    for (const v of validators) {
        if (v.logo)
            logoMap.set(v.nodeId, v.logo);
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
    (0, epoch_summary_1.updateEpochUserMap)(newMap);
    console.log(`📋 Tracking ${all.length} validator-channel pairs (${newMap.size} unique validators)`);
    for (const [nodeId, trackers] of newMap) {
        console.log(`   → ${trackers[0].validatorName || "unnamed"} (${(0, validator_1.formatNodeId)(nodeId)}) in ${trackers.length} channel(s)`);
    }
}
function processSSEMessage(client, data) {
    let parsed;
    try {
        parsed = JSON.parse(data);
    }
    catch {
        return; // Not JSON (e.g., "Connected to stream", "heartbeat")
    }
    // Handle finalized blocks
    if (parsed.type === "finalized_block") {
        const { author, block_num, round, epoch } = parsed.payload;
        if (!author)
            return;
        const trackers = trackedMap.get(author);
        if (!trackers || trackers.length === 0)
            return;
        const name = trackers[0].validatorName || (0, validator_1.formatNodeId)(author);
        const blockNumParsed = typeof block_num === "string" ? parseInt(block_num) : block_num;
        (0, epoch_summary_1.recordBlock)(String(epoch), author, blockNumParsed, trackers[0].validatorName, trackers[0].validatorLogo, trackers[0].commission);
        console.log(`🎰 TRACKED HIT: ${name} produced block #${block_num} (round ${round}, epoch ${epoch})`);
        console.log(`   Dispatching to ${trackers.length} channel(s)`);
        for (const tracker of trackers) {
            const slotEvent = {
                nodeId: author,
                validatorName: tracker.validatorName,
                validatorLogo: tracker.validatorLogo,
                commission: tracker.commission,
                blockNum: typeof block_num === "string" ? parseInt(block_num) : block_num,
                round: String(round),
                epoch: String(epoch),
                timestamp: Date.now(),
            };
            (0, notification_1.handleSlotEvent)(client, tracker.channelId, tracker.batchMode, slotEvent);
        }
    }
    // Handle timeouts (slot skips)
    if (parsed.type === "timeout") {
        const { AuthorNodeID, Round, Epoch } = parsed.payload;
        if (!AuthorNodeID)
            return;
        const trackers = trackedMap.get(AuthorNodeID);
        if (!trackers || trackers.length === 0)
            return;
        (0, epoch_summary_1.recordSkip)(String(Epoch), AuthorNodeID, trackers[0].validatorName, trackers[0].validatorLogo, trackers[0].commission);
        const notifiedUsers = new Set();
        for (const tracker of trackers) {
            if (notifiedUsers.has(tracker.addedBy))
                continue;
            notifiedUsers.add(tracker.addedBy);
            const skipEvent = {
                nodeId: AuthorNodeID,
                validatorName: tracker.validatorName,
                validatorLogo: tracker.validatorLogo,
                round: String(Round),
                epoch: String(Epoch),
                timestamp: Date.now(),
            };
            (0, notification_1.sendSkipAlert)(client, tracker.addedBy, skipEvent);
        }
    }
}
function startSSEListener(client) {
    let reconnectDelay = 1000;
    let blockCount = 0;
    let trackedHits = 0;
    function connect() {
        console.log("📡 Connecting to SSE stream...");
        const es = new eventsource_1.EventSource(SSE_URL);
        es.onopen = () => {
            console.log("📡 SSE connected");
            reconnectDelay = 1000;
        };
        es.onmessage = (event) => {
            const raw = String(event.data);
            // Parse JSON
            let data;
            try {
                data = JSON.parse(raw);
            }
            catch {
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
//# sourceMappingURL=sse-listener.js.map