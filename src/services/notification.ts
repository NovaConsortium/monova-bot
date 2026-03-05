import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getMonPrice } from "./price";
import { getBlockTips } from "./tips";
import { formatNodeId } from "../utils/validator";

const INFLATION_PER_SLOT = 25; // MON per leader slot
const MONAD_PURPLE = 0x836EF9;
const MONAD_RED = 0xEF4444;

export interface SlotEvent {
  nodeId: string;
  validatorName: string;
  validatorLogo: string;
  commission: number; // bps
  blockNum: number;
  round: string;
  epoch: string;
  timestamp: number;
}

interface BatchEntry {
  channelId: string;
  nodeId: string;
  validatorName: string;
  commission: number;
  slots: SlotEvent[];
  timer: NodeJS.Timeout | null;
  batchMs: number;
}

// In-memory batch accumulator
const batches = new Map<string, BatchEntry>();

function batchKey(channelId: string, nodeId: string): string {
  return `${channelId}:${nodeId}`;
}

function batchModeToMs(mode: string): number {
  switch (mode) {
    case "instant": return 0;
    case "1min": return 60_000;
    case "5min": return 300_000;
    case "10min": return 600_000;
    case "30min": return 1_800_000;
    default: return 0;
  }
}

async function sendEmbed(client: Client, channelId: string, slots: SlotEvent[]): Promise<void> {
  if (slots.length === 0) return;

  let channel: TextChannel | undefined;
  try {
    channel = await client.channels.fetch(channelId) as TextChannel | undefined;
  } catch {
    console.error(`❌ Could not fetch channel ${channelId}`);
    return;
  }
  if (!channel) return;

  const first = slots[0]!;
  const monPrice = await getMonPrice();
  const commissionRate = first.commission / 10000;
  const totalMonEarned = slots.length * INFLATION_PER_SLOT * commissionRate;
  const totalMonMinted = slots.length * INFLATION_PER_SLOT;
  const usdValue = monPrice ? totalMonEarned * monPrice : null;

  // Fetch tips for all blocks
  const tipsResults = await Promise.all(
    slots.map((s) => getBlockTips(s.blockNum))
  );
  const totalTipsMon = tipsResults.reduce((sum, r) => sum + (r?.totalTipsMon ?? 0), 0);
  const totalTxCount = tipsResults.reduce((sum, r) => sum + (r?.txCount ?? 0), 0);
  const tipsUsd = monPrice ? totalTipsMon * monPrice : null;

  const displayName = first.validatorName || formatNodeId(first.nodeId);

  const embed = new EmbedBuilder()
    .setColor(MONAD_PURPLE)
    .setTitle("⛓️ Leader Slot" + (slots.length > 1 ? "s" : "") + " Produced")
    .setTimestamp();

  if (first.validatorLogo) {
    embed.setThumbnail(first.validatorLogo);
  }

  if (slots.length === 1) {
    const slot = slots[0]!;
    const tips = tipsResults[0];
    embed.setDescription(
      `**${displayName}** just produced a block!`
    );
    embed.addFields(
      { name: "Block", value: `\`${slot.blockNum.toLocaleString()}\``, inline: true },
      { name: "Epoch", value: `\`${slot.epoch}\``, inline: true },
      { name: "Transactions", value: `\`${tips?.txCount ?? "?"}\``, inline: true },
      { name: "MON Minted", value: `\`${INFLATION_PER_SLOT} MON\``, inline: true },
      { name: "Commission", value: `\`${(commissionRate * 100).toFixed(2)}%\``, inline: true },
      {
        name: "Commission Earned",
        value: `\`${totalMonEarned.toFixed(4)} MON\`` +
          (usdValue !== null ? ` ($${usdValue.toFixed(4)})` : ""),
        inline: true,
      },
      {
        name: "Priority Fees",
        value: `\`${totalTipsMon.toFixed(6)} MON\`` +
          (tipsUsd !== null ? ` ($${tipsUsd.toFixed(4)})` : ""),
        inline: true,
      }
    );
  } else {
    const sortedBlocks = slots.map(s => s.blockNum).sort((a, b) => a - b);
    const blocksList = sortedBlocks.map(b => `\`${b.toLocaleString()}\``).join("\n");

    embed.setDescription(
      `**${displayName}** produced **${slots.length} blocks**!`
    );
    embed.addFields(
      { name: "Slots", value: blocksList, inline: false },
      { name: "Epoch", value: `\`${first.epoch}\``, inline: true },
      { name: "Transactions", value: `\`${totalTxCount}\``, inline: true },
      { name: "Total MON Minted", value: `\`${totalMonMinted} MON\``, inline: true },
      { name: "Commission", value: `\`${(commissionRate * 100).toFixed(2)}%\``, inline: true },
      {
        name: "Total Earned",
        value: `\`${totalMonEarned.toFixed(4)} MON\`` +
          (usdValue !== null ? ` ($${usdValue.toFixed(4)})` : ""),
        inline: true,
      },
      {
        name: "Priority Fees",
        value: `\`${totalTipsMon.toFixed(6)} MON\`` +
          (tipsUsd !== null ? ` ($${tipsUsd.toFixed(4)})` : ""),
        inline: true,
      }
    );
  }

  const footerParts: string[] = [];
  if (monPrice) footerParts.push(`MON Price: $${monPrice.toFixed(4)}`);
  if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(" | ") });

  try {
    await channel.send({ embeds: [embed] });
    console.log(`✅ Sent slot alert to channel ${channelId}`);
  } catch (error) {
    console.error(`❌ Failed to send embed to channel ${channelId}:`, error);
  }
}

export interface SkipEvent {
  nodeId: string;
  validatorName: string;
  validatorLogo: string;
  round: string;
  epoch: string;
  timestamp: number;
}

export async function sendSkipAlert(
  client: Client,
  userId: string,
  event: SkipEvent
): Promise<void> {
  const displayName = event.validatorName || formatNodeId(event.nodeId);

  const embed = new EmbedBuilder()
    .setColor(MONAD_RED)
    .setTitle("⚠️ Slot Skip Alert")
    .setDescription(`**${displayName}** failed to produce a block!`);

  if (event.validatorLogo) {
    embed.setThumbnail(event.validatorLogo);
  }

  embed
    .addFields(
      { name: "Round", value: `\`${event.round}\``, inline: true },
      { name: "Epoch", value: `\`${event.epoch}\``, inline: true },
      { name: "Node ID", value: `\`${formatNodeId(event.nodeId)}\``, inline: true },
    )
    .setFooter({ text: "Validator timed out on their assigned leader slot" })
    .setTimestamp();

  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to DM skip alert to user ${userId}:`, error);
  }
}

export function handleSlotEvent(
  client: Client,
  channelId: string,
  batchMode: string,
  event: SlotEvent
): void {
  const batchMs = batchModeToMs(batchMode);
  const key = batchKey(channelId, event.nodeId);

  console.log(`📨 handleSlotEvent: channel=${channelId} batchMode=${batchMode} batchMs=${batchMs}`);

  // Instant mode — send immediately
  if (batchMs === 0) {
    sendEmbed(client, channelId, [event]);
    return;
  }

  // Batched mode
  const existing = batches.get(key);

  if (existing) {
    existing.slots.push(event);
    // Timer already running, don't reset it — first event starts the window
  } else {
    const entry: BatchEntry = {
      channelId,
      nodeId: event.nodeId,
      validatorName: event.validatorName,
      commission: event.commission,
      slots: [event],
      timer: null,
      batchMs,
    };

    entry.timer = setTimeout(() => {
      const batch = batches.get(key);
      if (batch && batch.slots.length > 0) {
        sendEmbed(client, channelId, batch.slots);
      }
      batches.delete(key);
    }, batchMs);

    batches.set(key, entry);
  }
}
