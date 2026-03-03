# Contributing

## Development Setup

```bash
npm install
npm run dev   # Run with tsx (hot reload not supported — restart manually)
```

## Testing with MCP Inspector

### Discord

```bash
DISCORD_BOT_TOKEN=your-token \
DISCORD_CHANNEL_ID=your-channel \
npx @modelcontextprotocol/inspector node dist/index.js
```

### Slack

```bash
SLACK_BOT_TOKEN=xoxb-your-token \
SLACK_APP_TOKEN=xapp-your-token \
SLACK_CHANNEL_ID=your-channel \
npx @modelcontextprotocol/inspector node dist/index.js
```

## Testing with Claude Code

Add a local MCP entry pointing to the built output:

### Discord

```bash
claude mcp add ask-a-human-dev -- node /path/to/ask-a-human/dist/index.js
```

Then set `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID` (and optionally `DISCORD_USER_ID`) in your environment.

### Slack

```bash
claude mcp add ask-a-human-dev -- node /path/to/ask-a-human/dist/index.js
```

Then set `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID` (and optionally `SLACK_USER_ID`) in your environment.

## Code Structure

```
src/
├── index.ts              # MCP server, tool registration, orchestration
├── helpers.ts            # Shared utilities (truncate, sentinels)
├── platform.ts           # Platform interface, detection, factory
└── platforms/
    ├── discord.ts        # Discord implementation
    └── slack.ts          # Slack implementation
```

## Checks

```bash
npm run typecheck   # Type checking
npm run build       # Compile TypeScript
```
