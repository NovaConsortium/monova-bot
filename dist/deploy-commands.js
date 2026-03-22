"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const commands = [];
const commandsPath = path_1.default.join(__dirname, "commands");
const commandFiles = fs_1.default
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));
for (const file of commandFiles) {
    const command = require(path_1.default.join(commandsPath, file));
    if (command.data) {
        commands.push(command.data.toJSON());
    }
}
const rest = new discord_js_1.REST().setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log(`🔄 Registering ${commands.length} slash commands...`);
        console.log("Commands:", commands.map((c) => c.name).join(", "));
        const guildId = process.env.GUILD_ID;
        if (!guildId) {
            throw new Error("GUILD_ID is not set in environment");
        }
        await rest.put(discord_js_1.Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
        console.log(`✅ Registered ${commands.length} commands to guild ${guildId}`);
    }
    catch (error) {
        console.error("Failed to register commands:", error);
    }
})();
//# sourceMappingURL=deploy-commands.js.map