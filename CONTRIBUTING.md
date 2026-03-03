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

```sh
DISCORD_BOT_TOKEN=xxx DISCORD_CHANNEL_ID=xxx DISCORD_USER_ID=xxx \
  npx @modelcontextprotocol/inspector tsx src/index.ts
```

This opens a web UI where you can call the `ask_human` tool directly, see the Discord message, reply in the thread, and verify the response comes back.

## Testing with Claude Code

To test against a real Claude Code session:

```sh
claude mcp add \
  -e DISCORD_BOT_TOKEN=xxx \
  -e DISCORD_CHANNEL_ID=xxx \
  -e DISCORD_USER_ID=xxx \
  ask-a-human -- tsx /path/to/ask-a-human/src/index.ts
```

Then start a new Claude Code session and ask it to use the `ask_human` tool.
