# ask-a-human

An MCP server that lets Claude Code pause and ask you a question on Discord. You reply in a thread, and Claude continues with your answer.

**Roadmap:**
- Slack and Telegram support — March 3, 2026
- Support for other coding agents and harnesses — March 6, 2026

## Why

This isn't a chat interface for Claude Code. It's an escape hatch for fully autonomous workflows.

When you let Claude Code run on its own — refactoring a codebase, building a feature end-to-end, debugging a complex issue — it will occasionally hit a fork in the road: a trade-off you didn't anticipate, a design decision with no obvious right answer, or a critical juncture where moving forward without your input could mean wasted work. In those moments, Claude can choose to reach out to you on Discord, get your steer, and continue — rather than guessing wrong or stopping entirely.

The goal is to let you stay away from the terminal while Claude works, and only get pulled in when it genuinely matters.

## How it works

1. Claude Code calls the `ask_human` tool with a question
2. The bot posts the question to your Discord channel and @mentions you
3. A thread is created for the question
4. Claude Code waits until you reply in the thread
5. Your reply is returned to Claude and it continues working

## Setup

### 1. Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Go to **Bot** in the sidebar
4. Click **Reset Token** and copy it — this is your `DISCORD_BOT_TOKEN`
5. Enable **Message Content Intent** (scroll down on the Bot page)
6. Go to **OAuth2 > URL Generator**
7. Check the `bot` scope
8. Check these permissions: **Send Messages**, **Create Public Threads**, **Read Message History**, **Embed Links**
9. Copy the generated URL and open it to invite the bot to your server

### 2. Get your Discord IDs

1. Open Discord Settings > Advanced > enable **Developer Mode**
2. Right-click the channel where you want questions posted > **Copy Channel ID** — this is your `DISCORD_CHANNEL_ID`
3. Right-click your username > **Copy User ID** — this is your `DISCORD_USER_ID`

### 3. Add to Claude Code

```sh
claude mcp add \
  -e DISCORD_BOT_TOKEN=your-bot-token \
  -e DISCORD_CHANNEL_ID=your-channel-id \
  -e DISCORD_USER_ID=your-user-id \
  ask-a-human -- npx ask-a-human
```

That's it. Claude Code will now have access to the `ask_human` tool.

## Tool

### `ask_human`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask |
| `context` | string | No | Background context to help you understand the question |
| `options` | string[] | No | Predefined choices when applicable |

The question is posted as a rich embed in Discord with an @mention. If `context` or `options` are provided, they appear as additional fields in the embed.

**Example:**

```json
{
  "question": "Should I use PostgreSQL or SQLite for the local dev database?",
  "context": "Building a REST API. Production will use PostgreSQL on Railway.",
  "options": ["PostgreSQL (match prod)", "SQLite (simpler local setup)"]
}
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | — | Your Discord bot token |
| `DISCORD_CHANNEL_ID` | Yes | — | Channel ID where questions are posted |
| `DISCORD_USER_ID` | No | — | Your user ID for @mentions |
| `ASK_TIMEOUT_MS` | No | `18000000` | Timeout in milliseconds (default: 5 hours, `0` for no timeout) |

## Edge cases

- **Multiple replies**: First thread reply wins; subsequent replies are ignored
- **Empty messages**: Returned as `(empty message)`
- **Bot messages**: Filtered out automatically
- **Disconnections**: Discord.js auto-reconnects; pending questions persist in memory
- **Shutdown**: Pending questions return an error; cleanup is graceful on SIGINT/SIGTERM

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing instructions.

## License

MIT
