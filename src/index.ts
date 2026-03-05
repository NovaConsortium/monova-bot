import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { connectDB } from "./db/connection";
import { startSSEListener, refreshTrackedCache } from "./services/sse-listener";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Command collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
    }
  }
}

// Handle interactions (slash commands + autocomplete)
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Autocomplete error for ${interaction.commandName}:`, error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const reply = {
      content: "There was an error executing this command.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`🚀 Nova is online as ${c.user.tag}`);
  console.log(`📡 Serving ${c.guilds.cache.size} guilds`);

  // Deploy slash commands
  try {
    const { REST, Routes } = await import("discord.js");
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    const commandData = [...client.commands.values()].map((cmd) => cmd.data.toJSON());

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
        { body: commandData }
      );
      console.log(`🔄 Deployed ${commandData.length} commands to guild ${process.env.GUILD_ID}`);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID!),
        { body: commandData }
      );
      console.log(`🔄 Deployed ${commandData.length} commands globally`);
    }
  } catch (error) {
    console.error("❌ Failed to deploy commands:", error);
  }

  // Load tracked validators into memory and start SSE
  await refreshTrackedCache();
  startSSEListener(client);
});

// Boot sequence
async function main() {
  await connectDB();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
