# ask-a-human

An MCP server that lets Claude Code pause execution, ask a human a question via Slack, and resume when they reply in the thread.

Perfect for autonomous agent workflows that occasionally need a human decision.

## How it works

```
Claude Code ──stdio──▶ ask-a-human MCP server ──Socket Mode──▶ Slack
                                                                 │
                          reply returned ◀── thread reply ◀──────┘
```

1. Claude calls the `ask_human` tool with a question
2. A formatted message posts to your Slack channel
3. Execution blocks (with keepalive pings every 25s so the connection stays alive)
4. A human replies in the Slack thread
5. The tool resolves with the reply text and Claude continues

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Name it (e.g., "Ask a Human") and select your workspace

### 2. Enable Socket Mode

1. Go to **Settings** > **Socket Mode** and toggle it on
2. Create an app-level token with the `connections:write` scope
3. Copy the token — it starts with `xapp-`

### 3. Add Bot Scopes

Go to **OAuth & Permissions** > **Scopes** > **Bot Token Scopes** and add:

- `chat:write` — post messages
- `channels:read` — find channels
- `channels:history` — read thread replies

### 4. Subscribe to Events

Go to **Event Subscriptions** > **Subscribe to bot events** and add:

- `message.channels` — messages in public channels
- `message.groups` — messages in private channels

### 5. Install to Workspace

Go to **Install App** and click **Install to Workspace**. Authorize the permissions. Copy the **Bot User OAuth Token** — it starts with `xoxb-`.

### 6. Invite the Bot

- Invite the bot to your target channel: `/invite @YourBotName`
- Copy the **channel ID** (right-click channel name > "Copy link", the ID is the last path segment)

### 7. Get Your User ID (optional, for @mentions)

- Click your profile picture in Slack > **Profile**
- Click the **three dots** menu > **Copy member ID**

### 8. Add to Claude Code

```bash
claude mcp add ask-a-human -- npx ask-a-human

# Or with a specific path
claude mcp add ask-a-human -- node /path/to/ask-a-human/dist/index.js
```

Set the environment variables (via `.env` file, shell export, or Claude Code MCP config):

```bash
SLACK_BOT_TOKEN=xoxb-...        # Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...        # App-level token (Socket Mode)
SLACK_CHANNEL_ID=C0123456789    # Target channel ID
SLACK_USER_ID=U0123456789       # Optional: your member ID for @mentions
ASK_TIMEOUT_MS=1800000          # Optional: timeout in ms (default: 30 min, 0 = no timeout)
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

This posts a formatted Block Kit message to Slack and waits for a thread reply.

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
- **Disconnections**: Slack Bolt auto-reconnects; pending questions persist in memory
- **Timeout**: Configurable via `ASK_TIMEOUT_MS`; defaults to 30 minutes

## License

MIT
