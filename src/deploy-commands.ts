import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const commands: any[] = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log(`🔄 Registering ${commands.length} slash commands...`);
    console.log("Commands:", commands.map((c) => c.name).join(", "));

    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      throw new Error("GUILD_ID is not set in environment");
    }

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID!, guildId),
      { body: commands }
    );
    console.log(`✅ Registered ${commands.length} commands to guild ${guildId}`);
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
})();
