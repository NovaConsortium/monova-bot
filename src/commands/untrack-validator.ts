import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { TrackedValidator } from "../db/models/TrackedValidator";
import { refreshTrackedCache } from "../services/sse-listener";
import { formatNodeId } from "../utils/validator";

const MONAD_PURPLE = 0x836EF9;

export const data = new SlashCommandBuilder()
  .setName("untrack-validator")
  .setDescription("Stop tracking a Monad validator in this channel")
  .addStringOption((opt) =>
    opt
      .setName("node_id")
      .setDescription("The validator to stop tracking")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const channelId = interaction.channelId;

  const tracked = await TrackedValidator.find({ channelId });
  const filtered = tracked
    .filter(
      (v) =>
        v.validatorName.toLowerCase().includes(focused) ||
        v.nodeId.toLowerCase().includes(focused)
    )
    .slice(0, 25);

  await interaction.respond(
    filtered.map((v) => ({
      name: v.validatorName
        ? `${v.validatorName} (${formatNodeId(v.nodeId)})`
        : formatNodeId(v.nodeId),
      value: v.nodeId,
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const nodeId = interaction.options.getString("node_id", true).trim();
  const channelId = interaction.channelId;

  const deleted = await TrackedValidator.findOneAndDelete({ channelId, nodeId });

  if (!deleted) {
    await interaction.editReply(
      "⚠️ This validator is not being tracked in this channel."
    );
    return;
  }

  // Refresh in-memory cache
  await refreshTrackedCache();

  const displayName = deleted.validatorName || formatNodeId(nodeId);

  const embed = new EmbedBuilder()
    .setColor(MONAD_PURPLE)
    .setTitle("🛑 Validator Untracked")
    .setDescription(`Stopped tracking **${displayName}** in this channel.`)
    .addFields(
      { name: "Node ID", value: `\`${formatNodeId(nodeId)}\``, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
