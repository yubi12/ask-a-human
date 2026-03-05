# ask-a-human

An MCP server that lets Claude Code pause and ask you a question on Discord or Slack. You reply in a thread, and Claude continues with your answer.

## Roadmap

- **Telegram Support** (March 5, 2026) — Enable Claude to ask you questions via Telegram!

## Why

This isn't a chat interface for Claude Code. It's an escape hatch for fully autonomous workflows.

When you let Claude Code run on its own refactoring a codebase, building a feature end-to-end, or debugging a complex issue it will occasionally hit a fork in the road: a trade-off you didn't anticipate, a design decision with no obvious right answer, or a critical juncture where moving forward without your input could mean wasted work. In those moments, Claude can choose to reach out to you on Discord or Slack, get your steer, and continue rather than guessing wrong or stopping entirely. It's meant for the agent to reach you if it really needs to, and not for every little thing.

The goal is to let you stay away from the terminal while Claude works, and only get pulled in when it genuinely matters.

## How it works

1. Claude Code calls the `ask_human` tool with a question
2. The bot posts the question to your Discord channel or Slack channel and @mentions you
3. A thread is created for the question
4. Claude Code waits until you reply in the thread
5. Your reply is returned to Claude (along with a `thread_id`) and it continues working
6. If Claude needs to follow up, it calls `ask_human` again with the same `thread_id` to continue the conversation in the same thread

## Setup

Choose one platform per MCP server instance. The platform is auto-detected from environment variables.

### Discord

#### 1. Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Go to **Bot** in the sidebar
4. Click **Reset Token** and copy it — this is your `DISCORD_BOT_TOKEN`
5. Enable **Message Content Intent** (scroll down on the Bot page)
6. Go to **OAuth2 > URL Generator**
7. Check the `bot` scope
8. Check these permissions: **Send Messages**, **Send Messages in Threads**, **Create Public Threads**, **Read Message History**, **Embed Links**
9. Copy the generated URL and open it to invite the bot to your server

#### 2. Get your Discord IDs

1. Open Discord Settings > Advanced > enable **Developer Mode**
2. Right-click the channel where you want questions posted > **Copy Channel ID** — this is your `DISCORD_CHANNEL_ID`
3. Right-click your username > **Copy User ID** — this is your `DISCORD_USER_ID`

#### 3. Add to Claude Code

```sh
claude mcp add ask-a-human-discord \
  -e DISCORD_BOT_TOKEN=your-bot-token \
  -e DISCORD_CHANNEL_ID=your-channel-id \
  -e DISCORD_USER_ID=your-user-id \
  -- npx ask-a-human
```

### Slack

#### 1. Create a Slack app

1. Go to [Slack API: Your Apps](https://api.slack.com/apps)
2. Click **Create New App** > **From scratch**
3. Name it (e.g. "Ask a Human") and select your workspace

#### 2. Enable Socket Mode

1. Go to **Settings > Basic Information > App-Level Tokens**
2. Click **Generate Token and Scopes**
3. Name it (e.g. "socket") and add the `connections:write` scope
4. Click **Generate** and copy the token — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)
5. Go to **Settings > Socket Mode** and toggle it **on**

#### 3. Configure bot permissions

1. Go to **OAuth & Permissions** in the sidebar
2. Under **Bot Token Scopes**, add:
   - `chat:write` — post messages
   - `channels:history` — read thread replies in public channels
   - `groups:history` — read thread replies in private channels (if needed)
3. Click **Install to Workspace** (or **Reinstall** if already installed)
4. Copy the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN` (starts with `xoxb-`)

#### 4. Subscribe to events

1. Go to **Event Subscriptions** and toggle it **on**
2. Under **Subscribe to bot events**, add:
   - `message.channels` — messages in public channels
   - `message.groups` — messages in private channels (if needed)
3. Click **Save Changes**

#### 5. Get your Slack IDs

1. Open Slack, right-click the channel > **View channel details** > copy the Channel ID at the bottom — this is your `SLACK_CHANNEL_ID`
2. Click your profile picture > **Profile** > click the **⋯** menu > **Copy member ID** — this is your `SLACK_USER_ID`
3. Invite the bot to your channel: type `/invite @YourBotName` in the channel

#### 6. Add to Claude Code

```sh
claude mcp add ask-a-human-slack \
  -e SLACK_BOT_TOKEN=xoxb-your-bot-token \
  -e SLACK_APP_TOKEN=xapp-your-app-token \
  -e SLACK_CHANNEL_ID=your-channel-id \
  -e SLACK_USER_ID=your-user-id \
  -- npx ask-a-human
```

## Tool

### `ask_human`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask |
| `thread_id` | string | No | Thread ID from a previous response to continue the conversation in the same thread |

The question is posted as a plain text message with an @mention and a thread is created for your reply. **Important:** You must reply in the thread, not in the channel — only thread replies are picked up by the bot.

Every successful response includes a `thread_id` at the end (e.g. `[thread_id: 123456789]`). Pass this back in a subsequent call to continue the conversation in the same thread instead of creating a new one.

**New question:**

```json
{
  "question": "Should I use PostgreSQL or SQLite for the local dev database?"
}
```

**Follow-up in the same thread:**

```json
{
  "question": "Got it — PostgreSQL. Should I use Prisma or Drizzle as the ORM?",
  "thread_id": "123456789"
}
```

## Configuration

| Environment Variable | Platform | Required | Default | Description |
|---------------------|----------|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | Discord | Yes | — | Your Discord bot token |
| `DISCORD_CHANNEL_ID` | Discord | Yes | — | Channel ID where questions are posted |
| `DISCORD_USER_ID` | Discord | No | — | Your user ID for @mentions |
| `SLACK_BOT_TOKEN` | Slack | Yes | — | Bot User OAuth Token (`xoxb-`) |
| `SLACK_APP_TOKEN` | Slack | Yes | — | App-Level Token (`xapp-`) with `connections:write` |
| `SLACK_CHANNEL_ID` | Slack | Yes | — | Channel ID where questions are posted |
| `SLACK_USER_ID` | Slack | No | — | Your member ID for @mentions |
| `ASK_TIMEOUT_MS` | Both | No | `18000000` | Timeout in milliseconds (default: 5 hours, `0` for no timeout) |

## Edge cases

- **Multiple replies**: First thread reply wins; subsequent replies are ignored
- **Empty messages**: Returned as `(empty message)`
- **Bot messages**: Filtered out automatically
- **Disconnections**: Both Discord.js and Slack Bolt handle reconnection automatically; pending questions persist in memory
- **Shutdown**: Pending questions return an error; cleanup is graceful on SIGINT/SIGTERM
- **Both platforms configured**: Exits with a clear error — configure one platform per instance
- **Neither platform configured**: Exits with a clear error

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing instructions.

## License

MIT
