# ask-a-human

An MCP server that lets Claude Code pause execution, ask a human a question via **Discord** or **Slack**, and resume when they reply in the thread.

Perfect for autonomous agent workflows that occasionally need a human decision.

## How it works

```
Claude Code ──stdio──▶ ask-a-human MCP server ──▶ Discord or Slack
                                                       │
                          reply returned ◀── thread reply ◀──┘
```

1. Claude calls the `ask_human` tool with a question
2. A formatted message posts to your Discord or Slack channel
3. Execution blocks (with keepalive pings every 25s so the connection stays alive)
4. A human replies in the thread
5. The tool resolves with the reply text and Claude continues

The platform is auto-detected from environment variables — configure one platform per MCP server instance.

## Setup

### Option A: Discord

#### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**
2. Name it (e.g., "Ask a Human") and click **Create**

#### 2. Create a Bot

1. Go to **Bot** in the left sidebar
2. Click **Reset Token** and copy the token — this is your `DISCORD_BOT_TOKEN`
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**

#### 3. Set Bot Permissions

Go to **OAuth2** > **URL Generator**:

1. Under **Scopes**, select `bot`
2. Under **Bot Permissions**, select:
   - `Send Messages` — post questions
   - `Create Public Threads` — create reply threads
   - `Read Message History` — read thread replies
   - `Embed Links` — send rich embeds
3. Copy the generated URL and open it in your browser to invite the bot to your server

#### 4. Get Channel and User IDs

1. In Discord, go to **Settings** > **Advanced** and enable **Developer Mode**
2. Right-click the target channel > **Copy Channel ID** — this is your `DISCORD_CHANNEL_ID`
3. Right-click your username > **Copy User ID** — this is your `DISCORD_USER_ID` (optional, for @mentions)

#### 5. Add to Claude Code

```bash
claude mcp add ask-a-human -- npx ask-a-human
```

Set the environment variables:

```bash
DISCORD_BOT_TOKEN=...          # Bot token from Developer Portal
DISCORD_CHANNEL_ID=...         # Target channel ID
DISCORD_USER_ID=...            # Optional: your user ID for @mentions
ASK_TIMEOUT_MS=1800000         # Optional: timeout in ms (default: 30 min, 0 = no timeout)
```

### Option B: Slack

#### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Name it (e.g., "Ask a Human") and select your workspace

#### 2. Enable Socket Mode

1. Go to **Settings** > **Socket Mode** and toggle it on
2. When prompted, create an App-Level Token with the `connections:write` scope
3. Copy the token — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)

#### 3. Set Bot Token Scopes

Go to **Features** > **OAuth & Permissions** > **Bot Token Scopes** and add:

- `chat:write` — post messages
- `channels:history` — read thread replies in public channels
- `groups:history` — read thread replies in private channels (if needed)

#### 4. Subscribe to Events

Go to **Features** > **Event Subscriptions**, toggle on, and under **Subscribe to bot events** add:

- `message.channels` — listen for messages in public channels
- `message.groups` — listen for messages in private channels (if needed)

#### 5. Install the App

1. Go to **Settings** > **Install App** and click **Install to Workspace**
2. Copy the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN` (starts with `xoxb-`)

#### 6. Get Channel and User IDs

1. In Slack, right-click the target channel > **View channel details** > copy the Channel ID at the bottom
2. Your User ID can be found in your Slack profile > **⋮** > **Copy member ID**

#### 7. Add to Claude Code

```bash
claude mcp add ask-a-human -- npx ask-a-human
```

Set the environment variables:

```bash
SLACK_BOT_TOKEN=...            # Bot User OAuth Token (xoxb-)
SLACK_APP_TOKEN=...            # App-Level Token (xapp-) with connections:write scope
SLACK_CHANNEL_ID=...           # Target channel ID
SLACK_USER_ID=...              # Optional: your user ID for @mentions
ASK_TIMEOUT_MS=1800000         # Optional: timeout in ms (default: 30 min, 0 = no timeout)
```

### Multiple Platforms

To use both Discord and Slack, add separate MCP server entries:

```bash
claude mcp add ask-a-human-discord -- npx ask-a-human
claude mcp add ask-a-human-slack -- npx ask-a-human
```

Configure each with the appropriate environment variables. The platform is auto-detected from which env vars are present.

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

This posts a formatted message and waits for a thread reply.

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
- **Disconnections**: Both Discord.js and Slack Bolt handle reconnection automatically; pending questions persist in memory
- **Timeout**: Configurable via `ASK_TIMEOUT_MS`; defaults to 30 minutes
- **Both/neither platform configured**: Exits with a clear error message

## License

MIT
