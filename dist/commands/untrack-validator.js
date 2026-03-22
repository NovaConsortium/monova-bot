"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.autocomplete = autocomplete;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const TrackedValidator_1 = require("../db/models/TrackedValidator");
const sse_listener_1 = require("../services/sse-listener");
const validator_1 = require("../utils/validator");
const MONAD_PURPLE = 0x836EF9;
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("untrack-validator")
    .setDescription("Stop tracking a Monad validator in this channel")
    .addStringOption((opt) => opt
    .setName("node_id")
    .setDescription("The validator to stop tracking")
    .setRequired(true)
    .setAutocomplete(true));
async function autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const channelId = interaction.channelId;
    const tracked = await TrackedValidator_1.TrackedValidator.find({ channelId });
    const filtered = tracked
        .filter((v) => v.validatorName.toLowerCase().includes(focused) ||
        v.nodeId.toLowerCase().includes(focused))
        .slice(0, 25);
    await interaction.respond(filtered.map((v) => ({
        name: v.validatorName
            ? `${v.validatorName} (${(0, validator_1.formatNodeId)(v.nodeId)})`
            : (0, validator_1.formatNodeId)(v.nodeId),
        value: v.nodeId,
    })));
}
async function execute(interaction) {
    await interaction.deferReply();
    const nodeId = interaction.options.getString("node_id", true).trim();
    const channelId = interaction.channelId;
    const deleted = await TrackedValidator_1.TrackedValidator.findOneAndDelete({ channelId, nodeId });
    if (!deleted) {
        await interaction.editReply("⚠️ This validator is not being tracked in this channel.");
        return;
    }
    // Refresh in-memory cache
    await (0, sse_listener_1.refreshTrackedCache)();
    const displayName = deleted.validatorName || (0, validator_1.formatNodeId)(nodeId);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(MONAD_PURPLE)
        .setTitle("🛑 Validator Untracked")
        .setDescription(`Stopped tracking **${displayName}** in this channel.`)
        .addFields({ name: "Node ID", value: `\`${(0, validator_1.formatNodeId)(nodeId)}\``, inline: true })
        .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
//# sourceMappingURL=untrack-validator.js.map