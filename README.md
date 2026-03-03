# ask-a-human

An MCP server that lets Claude Code pause execution, ask a human a question via Discord, and resume when they reply in the thread.

Perfect for autonomous agent workflows that occasionally need a human decision.

## How it works

```
Claude Code ──stdio──▶ ask-a-human MCP server ──Gateway WebSocket──▶ Discord
                                                                       │
                          reply returned ◀── thread reply ◀────────────┘
```

1. Claude calls the `ask_human` tool with a question
2. A formatted embed posts to your Discord channel
3. Execution blocks (with keepalive pings every 25s so the connection stays alive)
4. A human replies in the Discord thread
5. The tool resolves with the reply text and Claude continues

## Setup

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**
2. Name it (e.g., "Ask a Human") and click **Create**

### 2. Create a Bot

1. Go to **Bot** in the left sidebar
2. Click **Reset Token** and copy the token — this is your `DISCORD_BOT_TOKEN`
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**

### 3. Set Bot Permissions

Go to **OAuth2** > **URL Generator**:

1. Under **Scopes**, select `bot`
2. Under **Bot Permissions**, select:
   - `Send Messages` — post questions
   - `Create Public Threads` — create reply threads
   - `Read Message History` — read thread replies
   - `Embed Links` — send rich embeds
3. Copy the generated URL and open it in your browser to invite the bot to your server

### 4. Get Channel and User IDs

1. In Discord, go to **Settings** > **Advanced** and enable **Developer Mode**
2. Right-click the target channel > **Copy Channel ID** — this is your `DISCORD_CHANNEL_ID`
3. Right-click your username > **Copy User ID** — this is your `DISCORD_USER_ID` (optional, for @mentions)

### 5. Add to Claude Code

```bash
claude mcp add ask-a-human -- npx ask-a-human

# Or with a specific path
claude mcp add ask-a-human -- node /path/to/ask-a-human/dist/index.js
```

Set the environment variables (via `.env` file, shell export, or Claude Code MCP config):

```bash
DISCORD_BOT_TOKEN=...          # Bot token from Developer Portal
DISCORD_CHANNEL_ID=...         # Target channel ID
DISCORD_USER_ID=...            # Optional: your user ID for @mentions
ASK_TIMEOUT_MS=1800000         # Optional: timeout in ms (default: 30 min, 0 = no timeout)
```

## Tool: `ask_human`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask |
| `context` | string | No | Background context |
| `options` | string[] | No | Predefined choices |

### Example

Claude might call:

```json
{
  "question": "Should I use PostgreSQL or SQLite for the local dev database?",
  "context": "Building a REST API. Production will use PostgreSQL on Railway.",
  "options": ["PostgreSQL (match prod)", "SQLite (simpler local setup)"]
}
```

This posts a rich embed to Discord and waits for a thread reply.

### Returns

- **On reply**: The human's message text
- **On timeout**: Error with timeout message

## Development

```bash
# Install dependencies
npm install

# Run directly with tsx
npm run dev

# Build
npm run build

# Run built version
npm start
```

## Edge Cases

- **Multiple replies**: The first thread reply resolves the question; subsequent replies are ignored
- **Empty messages**: Returned as `(empty message)`
- **Bot messages**: Filtered out (won't accidentally reply to itself)
- **Disconnections**: Discord.js auto-reconnects; pending questions persist in memory
- **Timeout**: Configurable via `ASK_TIMEOUT_MS`; defaults to 30 minutes

## License

MIT
