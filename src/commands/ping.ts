import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check if Nova is alive");

export async function execute(interaction: ChatInputCommandInteraction) {
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.reply(`🏓 Pong! Latency: ${latency}ms | API: ${interaction.client.ws.ping}ms`);
}
