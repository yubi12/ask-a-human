#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { z } from "zod";

// --- Environment validation ---

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const ASK_TIMEOUT_MS = Number(process.env.ASK_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutes default

if (!DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}
if (!DISCORD_CHANNEL_ID) {
  console.error("Missing DISCORD_CHANNEL_ID");
  process.exit(1);
}

// --- Helpers ---

const EMBED_DESCRIPTION_LIMIT = 4000;
const EMBED_FIELD_VALUE_LIMIT = 1000;
const THREAD_NAME_LIMIT = 100;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Sentinels use Symbols to prevent collision with user input
const SENTINEL_CANCELLED = Symbol("cancelled");
const SENTINEL_TIMEOUT = Symbol("timeout");
const SENTINEL_SHUTDOWN = Symbol("shutdown");

type QuestionResult = string | typeof SENTINEL_CANCELLED | typeof SENTINEL_TIMEOUT | typeof SENTINEL_SHUTDOWN;

// --- Pending questions tracking ---

interface PendingQuestion {
  resolve: (reply: QuestionResult) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  keepaliveId?: ReturnType<typeof setInterval>;
  abortHandler?: () => void;
}

const pendingQuestions = new Map<string, PendingQuestion>();

// --- Discord client setup ---

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Cached channel reference, set during startup
let targetChannel: GuildTextBasedChannel;

// Listen for thread replies to pending questions
discordClient.on(Events.MessageCreate, (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in threads
  if (!message.channel.isThread()) return;

  const pending = pendingQuestions.get(message.channelId);
  if (!pending) return;

  // First reply resolves; subsequent replies are ignored
  const replyText = message.content || "(empty message)";

  // Clean up timers and abort listener
  if (pending.timeoutId) clearTimeout(pending.timeoutId);
  if (pending.keepaliveId) clearInterval(pending.keepaliveId);

  pendingQuestions.delete(message.channelId);
  pending.resolve(replyText);
});

// --- MCP server setup ---

const mcpServer = new McpServer(
  { name: "ask-a-human", version: "0.1.0" },
  { capabilities: { logging: {}, tools: {} } },
);

mcpServer.registerTool("ask_human", {
  title: "Ask a Human",
  description:
    "Pause execution and ask a human a question via Discord. The human replies in a Discord thread and execution resumes with their answer.",
  inputSchema: {
    question: z.string().describe("The specific question to ask the human"),
    context: z
      .string()
      .optional()
      .describe("Background context to help the human understand the question"),
    options: z
      .array(z.string())
      .optional()
      .describe("Predefined choices when applicable"),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
}, async ({ question, context, options }, extra) => {
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("Claude Code needs your input")
    .setDescription(truncate(question, EMBED_DESCRIPTION_LIMIT))
    .setFooter({ text: "Reply in this thread to respond" });

  if (context) {
    embed.addFields({
      name: "Context",
      value: truncate(context, EMBED_FIELD_VALUE_LIMIT),
    });
  }

  if (options && options.length > 0) {
    const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
    embed.addFields({
      name: "Options",
      value: truncate(optionsList, EMBED_FIELD_VALUE_LIMIT),
    });
  }

  // Post message — mention in content (not embed) so the user gets pinged
  const sentMessage = await targetChannel.send({
    content: DISCORD_USER_ID ? `<@${DISCORD_USER_ID}>` : undefined,
    embeds: [embed],
  });

  // Create a thread off the message (truncate the full name to fit the limit)
  const thread = await sentMessage.startThread({
    name: truncate(`Question: ${question}`, THREAD_NAME_LIMIT),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
  });

  // Wait for reply with keepalives, cancellation, and optional timeout
  const reply = await new Promise<QuestionResult>((resolve) => {
    const pending: PendingQuestion = { resolve };

    function cleanup(sentinel: typeof SENTINEL_CANCELLED | typeof SENTINEL_TIMEOUT) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      if (pending.keepaliveId) clearInterval(pending.keepaliveId);
      pendingQuestions.delete(thread.id);
      resolve(sentinel);
    }

    // Handle client-initiated cancellation via AbortSignal
    const abortHandler = () => cleanup(SENTINEL_CANCELLED);
    pending.abortHandler = abortHandler;
    extra.signal.addEventListener("abort", abortHandler, { once: true });

    // Progress keepalives every 25 seconds
    pending.keepaliveId = setInterval(() => {
      mcpServer.sendLoggingMessage({
        level: "info",
        data: "Waiting for human reply on Discord...",
      });
    }, 25_000);

    // Optional timeout
    if (ASK_TIMEOUT_MS > 0) {
      pending.timeoutId = setTimeout(() => cleanup(SENTINEL_TIMEOUT), ASK_TIMEOUT_MS);
    }

    pendingQuestions.set(thread.id, pending);
  });

  if (reply === SENTINEL_CANCELLED) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Request was cancelled by the client.",
        },
      ],
      isError: true,
    };
  }

  if (reply === SENTINEL_TIMEOUT) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Timed out after ${ASK_TIMEOUT_MS / 1000 / 60} minutes waiting for a human reply.`,
        },
      ],
      isError: true,
    };
  }

  if (reply === SENTINEL_SHUTDOWN) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Server is shutting down.",
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text" as const, text: reply }],
  };
});

// --- Startup sequence ---

async function main() {
  // 1. Start Discord client and wait for it to be ready
  const readyPromise = new Promise<void>((resolve) => {
    discordClient.once(Events.ClientReady, () => resolve());
  });
  await discordClient.login(DISCORD_BOT_TOKEN);
  await readyPromise;
  console.error("Discord client ready");

  // 2. Fetch and validate the target channel once at startup
  const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID!);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    console.error("Configured DISCORD_CHANNEL_ID is not a valid guild text channel");
    process.exit(1);
  }
  targetChannel = channel as GuildTextBasedChannel;
  console.error(`Target channel: ${DISCORD_CHANNEL_ID}`);

  // 3. Connect MCP server to stdio transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("MCP server connected (stdio)");
}

// --- Graceful shutdown ---

async function shutdown() {
  console.error("Shutting down...");

  // Clean up all pending questions
  for (const [, pending] of pendingQuestions) {
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    if (pending.keepaliveId) clearInterval(pending.keepaliveId);
    pending.resolve(SENTINEL_SHUTDOWN);
  }
  pendingQuestions.clear();

  discordClient.destroy();
  await mcpServer.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
