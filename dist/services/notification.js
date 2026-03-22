"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSkipAlert = sendSkipAlert;
exports.handleSlotEvent = handleSlotEvent;
const discord_js_1 = require("discord.js");
const price_1 = require("./price");
const tips_1 = require("./tips");
const validator_1 = require("../utils/validator");
const INFLATION_PER_SLOT = 25; // MON per leader slot
const MONAD_PURPLE = 0x836EF9;
const MONAD_RED = 0xEF4444;
// In-memory batch accumulator
const batches = new Map();
function batchKey(channelId, nodeId) {
    return `${channelId}:${nodeId}`;
}
function batchModeToMs(mode) {
    switch (mode) {
        case "instant": return 0;
        case "1min": return 60_000;
        case "5min": return 300_000;
        case "10min": return 600_000;
        case "30min": return 1_800_000;
        default: return 0;
    }
}
async function sendEmbed(client, channelId, slots) {
    if (slots.length === 0)
        return;
    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    }
    catch {
        console.error(`❌ Could not fetch channel ${channelId}`);
        return;
    }
    if (!channel)
        return;
    const first = slots[0];
    const monPrice = await (0, price_1.getMonPrice)();
    const commissionRate = first.commission / 10000;
    const totalMonEarned = slots.length * INFLATION_PER_SLOT * commissionRate;
    const totalMonMinted = slots.length * INFLATION_PER_SLOT;
    const usdValue = monPrice ? totalMonEarned * monPrice : null;
    // Fetch tips for all blocks
    const tipsResults = await Promise.all(slots.map((s) => (0, tips_1.getBlockTips)(s.blockNum)));
    const totalTipsMon = tipsResults.reduce((sum, r) => sum + (r?.totalTipsMon ?? 0), 0);
    const totalTxCount = tipsResults.reduce((sum, r) => sum + (r?.txCount ?? 0), 0);
    const tipsUsd = monPrice ? totalTipsMon * monPrice : null;
    const displayName = first.validatorName || (0, validator_1.formatNodeId)(first.nodeId);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(MONAD_PURPLE)
        .setTitle("⛓️ Leader Slot" + (slots.length > 1 ? "s" : "") + " Produced")
        .setTimestamp();
    if (first.validatorLogo) {
        embed.setThumbnail(first.validatorLogo);
    }
    if (slots.length === 1) {
        const slot = slots[0];
        const tips = tipsResults[0];
        embed.setDescription(`**${displayName}** just produced a block!`);
        embed.addFields({ name: "Block", value: `\`${slot.blockNum.toLocaleString()}\``, inline: true }, { name: "Epoch", value: `\`${slot.epoch}\``, inline: true }, { name: "Transactions", value: `\`${tips?.txCount ?? "?"}\``, inline: true }, { name: "MON Minted", value: `\`${INFLATION_PER_SLOT} MON\``, inline: true }, { name: "Commission", value: `\`${(commissionRate * 100).toFixed(2)}%\``, inline: true }, {
            name: "Commission Earned",
            value: `\`${totalMonEarned.toFixed(4)} MON\`` +
                (usdValue !== null ? ` ($${usdValue.toFixed(4)})` : ""),
            inline: true,
        }, {
            name: "Priority Fees",
            value: `\`${totalTipsMon.toFixed(6)} MON\`` +
                (tipsUsd !== null ? ` ($${tipsUsd.toFixed(4)})` : ""),
            inline: true,
        });
    }
    else {
        const sortedBlocks = slots.map(s => s.blockNum).sort((a, b) => a - b);
        const blocksList = sortedBlocks.map(b => `\`${b.toLocaleString()}\``).join("\n");
        embed.setDescription(`**${displayName}** produced **${slots.length} blocks**!`);
        embed.addFields({ name: "Slots", value: blocksList, inline: false }, { name: "Epoch", value: `\`${first.epoch}\``, inline: true }, { name: "Transactions", value: `\`${totalTxCount}\``, inline: true }, { name: "Total MON Minted", value: `\`${totalMonMinted} MON\``, inline: true }, { name: "Commission", value: `\`${(commissionRate * 100).toFixed(2)}%\``, inline: true }, {
            name: "Total Earned",
            value: `\`${totalMonEarned.toFixed(4)} MON\`` +
                (usdValue !== null ? ` ($${usdValue.toFixed(4)})` : ""),
            inline: true,
        }, {
            name: "Priority Fees",
            value: `\`${totalTipsMon.toFixed(6)} MON\`` +
                (tipsUsd !== null ? ` ($${tipsUsd.toFixed(4)})` : ""),
            inline: true,
        });
    }
    const footerParts = [];
    if (monPrice)
        footerParts.push(`MON Price: $${monPrice.toFixed(4)}`);
    if (footerParts.length > 0)
        embed.setFooter({ text: footerParts.join(" | ") });
    try {
        await channel.send({ embeds: [embed] });
        console.log(`✅ Sent slot alert to channel ${channelId}`);
    }
    catch (error) {
        console.error(`❌ Failed to send embed to channel ${channelId}:`, error);
    }
}
async function sendSkipAlert(client, userId, event) {
    const displayName = event.validatorName || (0, validator_1.formatNodeId)(event.nodeId);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(MONAD_RED)
        .setTitle("⚠️ Slot Skip Alert")
        .setDescription(`**${displayName}** failed to produce a block!`);
    if (event.validatorLogo) {
        embed.setThumbnail(event.validatorLogo);
    }
    embed
        .addFields({ name: "Round", value: `\`${event.round}\``, inline: true }, { name: "Epoch", value: `\`${event.epoch}\``, inline: true }, { name: "Node ID", value: `\`${(0, validator_1.formatNodeId)(event.nodeId)}\``, inline: true })
        .setFooter({ text: "Validator timed out on their assigned leader slot" })
        .setTimestamp();
    try {
        const user = await client.users.fetch(userId);
        await user.send({ embeds: [embed] });
    }
    catch (error) {
        console.error(`Failed to DM skip alert to user ${userId}:`, error);
    }
}
function handleSlotEvent(client, channelId, batchMode, event) {
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
    }
    else {
        const entry = {
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
//# sourceMappingURL=notification.js.map