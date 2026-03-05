# ask-a-human

An MCP server that lets Claude Code pause and ask you a question on Discord or Slack. You reply in a thread, and Claude continues with your answer. Supports threaded conversations for multi-turn back-and-forth dialogue.

**Roadmap:**
- Support for other coding agents and harnesses — March 6, 2026

## Why

This isn't a chat interface for Claude Code. It's an escape hatch for fully autonomous workflows.

When you let Claude Code run on its own refactoring a codebase, building a feature end-to-end, or debugging a complex issue it will occasionally hit a fork in the road: a trade-off you didn't anticipate, a design decision with no obvious right answer, or a critical juncture where moving forward without your input could mean wasted work. In those moments, Claude can choose to reach out to you on Discord or Slack, get your steer, and continue rather than guessing wrong or stopping entirely. It's meant for the agent to reach you if it really needs to, and not for every little thing.

The goal is to let you stay away from the terminal while Claude works, and only get pulled in when it genuinely matters.

## How it works

1. Claude Code calls the `ask_human` tool with a question
2. The bot posts the question to your Discord or Slack channel and @mentions you
3. A thread is created for the question
4. Claude Code waits until you reply in the thread
5. Your reply is returned to Claude along with a `thread_id`
6. Claude can pass the `thread_id` back to ask follow-up questions in the same thread

## Setup

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
claude mcp add ask-a-human -e DISCORD_BOT_TOKEN=your-bot-token -e DISCORD_CHANNEL_ID=your-channel-id -e DISCORD_USER_ID=your-user-id -- npx ask-a-human
```

### Slack

#### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Under **OAuth & Permissions**, add the `chat:write` bot scope
3. Install the app to your workspace and copy the **Bot User OAuth Token** — this is your `SLACK_BOT_TOKEN`
4. Under **Socket Mode**, enable it and generate an **App-Level Token** with `connections:write` scope — this is your `SLACK_APP_TOKEN`
5. Under **Event Subscriptions**, enable events and subscribe to `message.channels` (or `message.groups` for private channels)
6. Invite the bot to your channel with `/invite @your-bot-name`

#### 2. Get your Slack IDs

1. Right-click the channel > **View channel details** > copy the Channel ID at the bottom — this is your `SLACK_CHANNEL_ID`
2. Your Slack user ID can be found in your profile — this is your `SLACK_USER_ID`

#### 3. Add to Claude Code

```sh
claude mcp add ask-a-human -e SLACK_BOT_TOKEN=xoxb-... -e SLACK_APP_TOKEN=xapp-... -e SLACK_CHANNEL_ID=your-channel-id -e SLACK_USER_ID=your-user-id -- npx ask-a-human
```

## Tool

### `ask_human`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask |
| `context` | string | No | Background context to help you understand the question |
| `options` | string[] | No | Predefined choices when applicable |
| `thread_id` | string | No | Thread ID from a previous response to continue the conversation |

The question is posted as a rich embed (Discord) or Block Kit message (Slack) with an @mention. If `context` or `options` are provided, they appear as additional fields.

Successful responses include a `thread_id` at the end:

```
Your reply text here

[thread_id: 1234567890]
```

**Example — new question:**

```json
{
  "question": "Should I use PostgreSQL or SQLite for the local dev database?",
  "context": "Building a REST API. Production will use PostgreSQL on Railway.",
  "options": ["PostgreSQL (match prod)", "SQLite (simpler local setup)"]
}
```

**Example — follow-up in same thread:**

```json
{
  "question": "Got it, PostgreSQL. Should I add a docker-compose.yml for the local database or use a hosted dev instance?",
  "thread_id": "1234567890"
}
```

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | Yes* | — | Your Discord bot token |
| `DISCORD_CHANNEL_ID` | Yes* | — | Channel ID where questions are posted |
| `DISCORD_USER_ID` | No | — | Your user ID for @mentions |
| `SLACK_BOT_TOKEN` | Yes* | — | Your Slack bot user OAuth token |
| `SLACK_APP_TOKEN` | Yes* | — | Your Slack app-level token (Socket Mode) |
| `SLACK_CHANNEL_ID` | Yes* | — | Channel ID where questions are posted |
| `SLACK_USER_ID` | No | — | Your user ID for @mentions |
| `ASK_TIMEOUT_MS` | No | `18000000` | Timeout in milliseconds (default: 5 hours, `0` for no timeout) |

\* Configure one platform per MCP server instance. Set either `DISCORD_BOT_TOKEN` or `SLACK_BOT_TOKEN`, not both.

## Edge cases

- **Multiple replies**: First thread reply wins; subsequent replies are ignored
- **Empty messages**: Returned as `(empty message)`
- **Bot messages**: Filtered out automatically
- **Disconnections**: Discord.js auto-reconnects; pending questions persist in memory
- **Shutdown**: Pending questions return an error; cleanup is graceful on SIGINT/SIGTERM
- **Invalid thread_id**: Returns an error (e.g. thread not found, wrong format)
- **Threaded follow-ups**: The same `thread_id` works for unlimited back-and-forth exchanges

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing instructions.

## License

MIT
