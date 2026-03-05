# Monad Bot

A Discord bot that tracks Monad validators and sends real-time notifications when they produce leader slots. Built by [Nova Consortium](https://novaconsortium.org).

## About Nova Consortium

Nova Consortium is a research fund aimed at accelerating academic, technological, and financial research in crypto through strategic grants and scholarships to researchers and crypto community students.

Learn more at [novaconsortium.org](https://novaconsortium.org).

## Features

- **Validator Tracking** — Track any Monad validator by node ID with autocomplete search
- **Leader Slot Alerts** — Get notified in real-time when a tracked validator produces a block
- **Slot Skip Alerts** — Receive DMs when a tracked validator misses their assigned slot
- **Earnings Breakdown** — See MON minted, commission earned, priority fees, and USD values
- **Batch Notifications** — Choose instant alerts or batch them over 1/5/10/30 minute windows
- **Slot Archiving** — All slot events are archived to JSONL files organized by epoch

## Use the Bot

Don't want to self-host? Invite the bot directly to your server:

[**Add Monova Monad Bot to your server**](https://discord.com/oauth2/authorize?client_id=1477388399404122162&permissions=2048&integration_type=0&scope=bot+applications.commands)

## Self-Hosting

### Prerequisites

- Node.js 18+
- MongoDB instance
- Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### 1. Clone the repository

```bash
git clone https://github.com/your-username/monova-bot.git
cd monova-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=your_discord_server_id  # optional — omit for global command deployment
MONGODB_URI=your_mongodb_connection_string
```

### 4. Run the bot

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

### 5. Deploy commands (optional)

Commands are auto-deployed on bot startup. To deploy manually:

```bash
npm run deploy
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/ping` | Check if the bot is online and view latency |
| `/track-validator` | Track a validator by node ID with optional batch mode |
| `/untrack-validator` | Stop tracking a validator in the current channel |

### Tracking a Validator

1. Use `/track-validator` in any channel
2. Start typing a validator name or node ID — autocomplete will suggest matches
3. Optionally select a batch mode (instant, 1min, 5min, 10min, 30min)
4. The bot will confirm tracking and show validator details

### Notification Example

When a tracked validator produces a block, the bot posts an embed with:
- Block number and epoch
- Transaction count
- MON minted and commission earned
- Priority fees collected
- Current MON price in USD

## Credits

This bot relies on the following services:

- **[gmonads](https://gmonads.com)** — Validator metadata, epoch data, and SSE stream for real-time block events
- **[Monad RPC](https://rpc.monad.xyz)** — Block and receipt data for priority fee calculations
- **[CoinGecko](https://coingecko.com)** — MON/USD price data
- **[Discord.js](https://discord.js.org)** — Discord API library
- **[Mongoose](https://mongoosejs.com)** — MongoDB object modeling

## License

ISC
