# Contributing

## Development setup

```sh
# Clone the repo
git clone https://github.com/yubi12/ask-a-human.git
cd ask-a-human

# Install dependencies
npm install

# Copy environment file and fill in your values
cp .env.example .env
```

## Running locally

```sh
# Development mode (auto-reloads with tsx)
npm run dev

# Build and run compiled version
npm run build
npm start

# Type check
npm run typecheck
```

## Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) lets you test the server without configuring Claude Code.

### Discord

```sh
DISCORD_BOT_TOKEN=xxx DISCORD_CHANNEL_ID=xxx DISCORD_USER_ID=xxx \
  npx @modelcontextprotocol/inspector tsx src/index.ts
```

### Slack

```sh
SLACK_BOT_TOKEN=xoxb-xxx SLACK_APP_TOKEN=xapp-xxx SLACK_CHANNEL_ID=xxx SLACK_USER_ID=xxx \
  npx @modelcontextprotocol/inspector tsx src/index.ts
```

This opens a web UI where you can call the `ask_human` tool directly, see the message on your platform, reply in the thread, and verify the response comes back.

## Testing with Claude Code

To test against a real Claude Code session:

### Discord

```sh
claude mcp add \
  -e DISCORD_BOT_TOKEN=xxx \
  -e DISCORD_CHANNEL_ID=xxx \
  -e DISCORD_USER_ID=xxx \
  ask-a-human -- tsx /path/to/ask-a-human/src/index.ts
```

### Slack

```sh
claude mcp add \
  -e SLACK_BOT_TOKEN=xoxb-xxx \
  -e SLACK_APP_TOKEN=xapp-xxx \
  -e SLACK_CHANNEL_ID=xxx \
  -e SLACK_USER_ID=xxx \
  ask-a-human -- tsx /path/to/ask-a-human/src/index.ts
```

Then start a new Claude Code session and ask it to use the `ask_human` tool.

## Architecture

The codebase uses a platform abstraction to support multiple messaging platforms:

- `src/index.ts` — Platform-agnostic MCP server, tool registration, and orchestration
- `src/helpers.ts` — Shared utilities (truncate, sentinel symbols, types)
- `src/platform.ts` — `Platform` interface, auto-detection, and factory
- `src/platforms/discord.ts` — Discord implementation using discord.js
- `src/platforms/slack.ts` — Slack implementation using @slack/bolt with Socket Mode

To add a new platform, implement the `Platform` interface and add detection logic to `detectPlatform()` and `createPlatform()` in `src/platform.ts`.
