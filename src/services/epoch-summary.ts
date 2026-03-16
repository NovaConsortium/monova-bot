import { Client, EmbedBuilder } from "discord.js";
import { getMonPrice } from "./price";
import { getBlockTips } from "./tips";
import { formatNodeId } from "../utils/validator";

const INFLATION_PER_SLOT = 25;
const MONAD_PURPLE = 0x836EF9;

interface ValidatorEpochStats {
  nodeId: string;
  validatorName: string;
  validatorLogo: string;
  commission: number; // bps
  blocks: number[];  // block numbers
  skips: number;
}

// Map<epoch, Map<nodeId, ValidatorEpochStats>>
const epochStats = new Map<string, Map<string, ValidatorEpochStats>>();

// Map<nodeId, Set<userId>> — who to DM for each validator
let userMap = new Map<string, Set<string>>();

export function updateEpochUserMap(
  tracked: Map<string, Array<{ addedBy: string }>>
): void {
  const newMap = new Map<string, Set<string>>();
  for (const [nodeId, trackers] of tracked) {
    const users = new Set<string>();
    for (const t of trackers) {
      users.add(t.addedBy);
    }
    newMap.set(nodeId, users);
  }
  userMap = newMap;
}

export function recordBlock(
  epoch: string,
  nodeId: string,
  blockNum: number,
  validatorName: string,
  validatorLogo: string,
  commission: number
): void {
  let validators = epochStats.get(epoch);
  if (!validators) {
    validators = new Map();
    epochStats.set(epoch, validators);
  }

  let stats = validators.get(nodeId);
  if (!stats) {
    stats = { nodeId, validatorName, validatorLogo, commission, blocks: [], skips: 0 };
    validators.set(nodeId, stats);
  }

  stats.blocks.push(blockNum);
}

export function recordSkip(
  epoch: string,
  nodeId: string,
  validatorName: string,
  validatorLogo: string,
  commission: number
): void {
  let validators = epochStats.get(epoch);
  if (!validators) {
    validators = new Map();
    epochStats.set(epoch, validators);
  }

  let stats = validators.get(nodeId);
  if (!stats) {
    stats = { nodeId, validatorName, validatorLogo, commission, blocks: [], skips: 0 };
    validators.set(nodeId, stats);
  }

  stats.skips++;
}

export async function sendEpochSummaries(
  client: Client,
  epoch: string
): Promise<void> {
  const validators = epochStats.get(epoch);
  if (!validators) return;

  const monPrice = await getMonPrice();

  // Group stats by userId
  const userSummaries = new Map<string, ValidatorEpochStats[]>();

  for (const [nodeId, stats] of validators) {
    const users = userMap.get(nodeId);
    if (!users) continue;

    for (const userId of users) {
      const existing = userSummaries.get(userId) || [];
      existing.push(stats);
      userSummaries.set(userId, existing);
    }
  }

  for (const [userId, validatorStats] of userSummaries) {
    try {
      const embed = await buildSummaryEmbed(epoch, validatorStats, monPrice);
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
      console.log(`📊 Sent epoch ${epoch} summary to user ${userId}`);
    } catch (error) {
      console.error(`Failed to DM epoch summary to user ${userId}:`, error);
    }
  }

  // Clean up old epoch data
  epochStats.delete(epoch);
}

async function buildSummaryEmbed(
  epoch: string,
  validators: ValidatorEpochStats[],
  monPrice: number | null
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setColor(MONAD_PURPLE)
    .setTitle(`Epoch ${epoch} Summary`)
    .setTimestamp();

  let totalEarned = 0;
  let totalTips = 0;

  for (const v of validators) {
    const commissionRate = v.commission / 10000;
    const slotCount = v.blocks.length;
    const monEarned = slotCount * INFLATION_PER_SLOT * commissionRate;
    totalEarned += monEarned;

    // Fetch tips for all blocks (limit concurrency)
    let tipsMon = 0;
    const tipBatches = [];
    for (let i = 0; i < v.blocks.length; i += 10) {
      tipBatches.push(v.blocks.slice(i, i + 10));
    }
    for (const batch of tipBatches) {
      const results = await Promise.all(batch.map((b) => getBlockTips(b)));
      for (const r of results) {
        tipsMon += r?.totalTipsMon ?? 0;
      }
    }
    totalTips += tipsMon;

    const displayName = v.validatorName || formatNodeId(v.nodeId);
    const usdEarned = monPrice ? monEarned * monPrice : null;
    const usdTips = monPrice ? tipsMon * monPrice : null;

    let value =
      `Slots: **${slotCount}**` +
      (v.skips > 0 ? ` | Skips: **${v.skips}**` : "") +
      `\nCommission: \`${monEarned.toFixed(4)} MON\`` +
      (usdEarned !== null ? ` ($${usdEarned.toFixed(2)})` : "") +
      `\nPriority Fees: \`${tipsMon.toFixed(6)} MON\`` +
      (usdTips !== null ? ` ($${usdTips.toFixed(2)})` : "");

    if (v.validatorLogo && validators.length === 1) {
      embed.setThumbnail(v.validatorLogo);
    }

    embed.addFields({ name: displayName, value, inline: false });
  }

  const totalUsd = monPrice ? (totalEarned + totalTips) * monPrice : null;
  embed.addFields({
    name: "Total",
    value:
      `Commission: \`${totalEarned.toFixed(4)} MON\`` +
      `\nPriority Fees: \`${totalTips.toFixed(6)} MON\`` +
      (totalUsd !== null ? `\nTotal USD: **$${totalUsd.toFixed(2)}**` : ""),
    inline: false,
  });

  const footerParts: string[] = [];
  if (monPrice) footerParts.push(`MON Price: $${monPrice.toFixed(4)}`);
  if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(" | ") });

  return embed;
}
