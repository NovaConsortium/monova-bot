import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { TrackedValidator } from "../db/models/TrackedValidator";
import { fetchValidatorInfo, formatNodeId, fetchAllValidators } from "../utils/validator";
import { refreshTrackedCache } from "../services/sse-listener";

const MONAD_PURPLE = 0x836EF9;

export const data = new SlashCommandBuilder()
  .setName("track-validator")
  .setDescription("Track a Monad validator and get notified on leader slots")
  .addStringOption((opt) =>
    opt
      .setName("node_id")
      .setDescription("The validator's node ID (hex public key)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("batch_mode")
      .setDescription("How to batch notifications (default: instant)")
      .setRequired(false)
      .addChoices(
        { name: "Instant — notify every slot", value: "instant" },
        { name: "1 minute — batch slots over 1 min", value: "1min" },
        { name: "5 minutes — batch slots over 5 min", value: "5min" },
        { name: "10 minutes — batch slots over 10 min", value: "10min" },
        { name: "30 minutes — batch slots over 30 min", value: "30min" }
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();

  const validators = await fetchAllValidators();
  const filtered = validators
    .filter(
      (v) =>
        v.name.toLowerCase().includes(focused) ||
        v.nodeId.toLowerCase().includes(focused)
    )
    .slice(0, 25);

  await interaction.respond(
    filtered.map((v) => ({
      name: v.name ? `${v.name} (${formatNodeId(v.nodeId)})` : formatNodeId(v.nodeId),
      value: v.nodeId,
    }))
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const nodeId = interaction.options.getString("node_id", true).trim();
  const batchMode = interaction.options.getString("batch_mode") || "instant";
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.editReply("❌ This command can only be used in a server.");
    return;
  }

  // Validate node_id format (hex, typically starts with 02 or 03)
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(nodeId)) {
    await interaction.editReply(
      "❌ Invalid node ID format. It should be a 66-character hex string starting with `02` or `03`."
    );
    return;
  }

  // Check if already tracked in this channel
  const existing = await TrackedValidator.findOne({ channelId, nodeId });
  if (existing) {
    await interaction.editReply(
      `⚠️ This validator is already being tracked in this channel.\nUse \`/untrack-validator\` first if you want to change settings.`
    );
    return;
  }

  // Fetch validator info from gmonads
  const info = await fetchValidatorInfo(nodeId);
  if (!info) {
    await interaction.editReply(
      "❌ Could not find this validator on the Monad network. Double-check the node ID."
    );
    return;
  }

  if (!info.active) {
    await interaction.editReply(
      "⚠️ This validator exists but is **not active** in the current epoch. It won't produce leader slots. Tracking anyway..."
    );
  }

  // Save to DB
  await TrackedValidator.create({
    guildId,
    channelId,
    nodeId,
    validatorName: info.name,
    commission: info.commission,
    batchMode,
    addedBy: interaction.user.id,
  });

  // Refresh in-memory cache
  await refreshTrackedCache();

  const displayName = info.name || formatNodeId(nodeId);
  const commissionPct = (info.commission / 100).toFixed(
    info.commission % 100 === 0 ? 0 : 2
  );

  const embed = new EmbedBuilder()
    .setColor(MONAD_PURPLE)
    .setTitle("✅ Validator Tracked")
    .setDescription(`Now tracking **${displayName}** in this channel.`)
    .addFields(
      { name: "Node ID", value: `\`${formatNodeId(nodeId)}\``, inline: true },
      { name: "Commission", value: `\`${commissionPct}%\``, inline: true },
      {
        name: "Stake",
        value: `\`${Number(info.stake).toLocaleString()} MON\``,
        inline: true,
      },
      { name: "Status", value: info.active ? "🟢 Active" : "🔴 Inactive", inline: true },
      {
        name: "Batch Mode",
        value: `\`${batchMode}\``,
        inline: true,
      }
    )
    .setFooter({ text: "You'll be notified when this validator produces a leader slot." })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
