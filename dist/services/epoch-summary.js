"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEpochUserMap = updateEpochUserMap;
exports.recordBlock = recordBlock;
exports.recordSkip = recordSkip;
exports.writeValidatorLog = writeValidatorLog;
exports.sendEpochSummaries = sendEpochSummaries;
const discord_js_1 = require("discord.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const price_1 = require("./price");
const tips_1 = require("./tips");
const validator_1 = require("../utils/validator");
const github_upload_1 = require("./github-upload");
const VALIDATOR_DATA_DIR = path_1.default.join(process.cwd(), "validatorData");
const INFLATION_PER_SLOT = 25;
const MONAD_PURPLE = 0x836EF9;
// Map<epoch, Map<nodeId, ValidatorEpochStats>>
const epochStats = new Map();
// Map<nodeId, Set<userId>> — who to DM for each validator
let userMap = new Map();
function updateEpochUserMap(tracked) {
    const newMap = new Map();
    for (const [nodeId, trackers] of tracked) {
        const users = new Set();
        for (const t of trackers) {
            users.add(t.addedBy);
        }
        newMap.set(nodeId, users);
    }
    userMap = newMap;
}
function recordBlock(epoch, nodeId, blockNum, validatorName, validatorLogo, commission) {
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
function recordSkip(epoch, nodeId, validatorName, validatorLogo, commission) {
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
function ensureValidatorDir() {
    if (!fs_1.default.existsSync(VALIDATOR_DATA_DIR)) {
        fs_1.default.mkdirSync(VALIDATOR_DATA_DIR, { recursive: true });
    }
}
async function writeValidatorLog(epoch) {
    const validators = epochStats.get(epoch);
    if (!validators || validators.size === 0)
        return;
    ensureValidatorDir();
    const filePath = path_1.default.join(VALIDATOR_DATA_DIR, `validators-${epoch}.jsonl`);
    const lines = [];
    for (const [, stats] of validators) {
        const totalSlots = stats.blocks.length + stats.skips;
        const successRate = totalSlots > 0
            ? ((stats.blocks.length / totalSlots) * 100).toFixed(2)
            : "0.00";
        const entry = {
            epoch,
            nodeId: stats.nodeId,
            validatorName: stats.validatorName,
            commission: stats.commission,
            totalSlots,
            successful: stats.blocks.length,
            timeouts: stats.skips,
            successRate: `${successRate}%`,
            blocks: stats.blocks.sort((a, b) => a - b),
            timestamp: Date.now(),
        };
        lines.push(JSON.stringify(entry));
    }
    fs_1.default.writeFileSync(filePath, lines.join("\n") + "\n");
    console.log(`📊 Wrote validator log for epoch ${epoch} (${validators.size} validators) to ${filePath}`);
    // Upload to GitHub
    const result = await (0, github_upload_1.uploadToGitHub)(filePath, "validatorData");
    if (!result.success) {
        console.error(`❌ GitHub upload failed for validator log epoch ${epoch}: ${result.error}`);
    }
}
async function sendEpochSummaries(client, epoch) {
    const validators = epochStats.get(epoch);
    if (!validators)
        return;
    // Write validator log before sending summaries
    await writeValidatorLog(epoch);
    const monPrice = await (0, price_1.getMonPrice)();
    // Group stats by userId
    const userSummaries = new Map();
    for (const [nodeId, stats] of validators) {
        const users = userMap.get(nodeId);
        if (!users)
            continue;
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
        }
        catch (error) {
            console.error(`Failed to DM epoch summary to user ${userId}:`, error);
        }
    }
    // Clean up old epoch data
    epochStats.delete(epoch);
}
async function buildSummaryEmbed(epoch, validators, monPrice) {
    const embed = new discord_js_1.EmbedBuilder()
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
            const results = await Promise.all(batch.map((b) => (0, tips_1.getBlockTips)(b)));
            for (const r of results) {
                tipsMon += r?.totalTipsMon ?? 0;
            }
        }
        totalTips += tipsMon;
        const displayName = v.validatorName || (0, validator_1.formatNodeId)(v.nodeId);
        const usdEarned = monPrice ? monEarned * monPrice : null;
        const usdTips = monPrice ? tipsMon * monPrice : null;
        let value = `Slots: **${slotCount}**` +
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
        value: `Commission: \`${totalEarned.toFixed(4)} MON\`` +
            `\nPriority Fees: \`${totalTips.toFixed(6)} MON\`` +
            (totalUsd !== null ? `\nTotal USD: **$${totalUsd.toFixed(2)}**` : ""),
        inline: false,
    });
    const footerParts = [];
    if (monPrice)
        footerParts.push(`MON Price: $${monPrice.toFixed(4)}`);
    if (footerParts.length > 0)
        embed.setFooter({ text: footerParts.join(" | ") });
    return embed;
}
//# sourceMappingURL=epoch-summary.js.map