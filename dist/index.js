"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const connection_1 = require("./db/connection");
const sse_listener_1 = require("./services/sse-listener");
const api_server_1 = require("./services/api-server");
dotenv_1.default.config();
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
    ],
});
// Command collection
client.commands = new discord_js_1.Collection();
// Load commands
const commandsPath = path_1.default.join(__dirname, "commands");
if (fs_1.default.existsSync(commandsPath)) {
    const commandFiles = fs_1.default
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));
    for (const file of commandFiles) {
        const command = require(path_1.default.join(commandsPath, file));
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Loaded command: ${command.data.name}`);
        }
    }
}
// Handle interactions (slash commands + autocomplete)
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
            try {
                await command.autocomplete(interaction);
            }
            catch (error) {
                console.error(`Autocomplete error for ${interaction.commandName}:`, error);
            }
        }
        return;
    }
    if (!interaction.isChatInputCommand())
        return;
    const command = client.commands.get(interaction.commandName);
    if (!command)
        return;
    try {
        await command.execute(interaction);
    }
    catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const reply = {
            content: "There was an error executing this command.",
            ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        }
        else {
            await interaction.reply(reply);
        }
    }
});
// Ready event
client.once(discord_js_1.Events.ClientReady, async (c) => {
    console.log(`🚀 Nova is online as ${c.user.tag}`);
    console.log(`📡 Serving ${c.guilds.cache.size} guilds`);
    // Deploy slash commands
    try {
        const { REST, Routes } = await Promise.resolve().then(() => __importStar(require("discord.js")));
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        const commandData = [...client.commands.values()].map((cmd) => cmd.data.toJSON());
        if (process.env.GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commandData });
            console.log(`🔄 Deployed ${commandData.length} commands to guild ${process.env.GUILD_ID}`);
        }
        else {
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });
            console.log(`🔄 Deployed ${commandData.length} commands globally`);
        }
    }
    catch (error) {
        console.error("❌ Failed to deploy commands:", error);
    }
    // Start API server
    (0, api_server_1.startAPIServer)();
    // Load tracked validators into memory and start SSE
    await (0, sse_listener_1.refreshTrackedCache)();
    (0, sse_listener_1.startSSEListener)(client);
});
// Boot sequence
async function main() {
    await (0, connection_1.connectDB)();
    await client.login(process.env.DISCORD_TOKEN);
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map