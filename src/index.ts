#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { App } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { z } from "zod";

// --- Environment validation ---

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
const SLACK_USER_ID = process.env.SLACK_USER_ID;
const ASK_TIMEOUT_MS = Number(process.env.ASK_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutes default

if (!SLACK_BOT_TOKEN) {
  console.error("Missing SLACK_BOT_TOKEN (xoxb-...)");
  process.exit(1);
}
if (!SLACK_APP_TOKEN) {
  console.error("Missing SLACK_APP_TOKEN (xapp-...)");
  process.exit(1);
}
if (!SLACK_CHANNEL_ID) {
  console.error("Missing SLACK_CHANNEL_ID");
  process.exit(1);
}

// --- Pending questions tracking ---

interface PendingQuestion {
  resolve: (reply: string) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  keepaliveId?: ReturnType<typeof setInterval>;
}

const pendingQuestions = new Map<string, PendingQuestion>();

// --- Slack app setup (Socket Mode) ---

const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

// Listen for all messages — filter for thread replies to our pending questions
slackApp.message(async ({ message }) => {
  // Only process actual user messages in threads
  if (
    message.subtype !== undefined ||
    !("thread_ts" in message) ||
    !message.thread_ts ||
    "bot_id" in message
  ) {
    return;
  }

  // Ignore messages that are thread parents (ts === thread_ts)
  if (message.ts === message.thread_ts) {
    return;
  }

  const pending = pendingQuestions.get(message.thread_ts);
  if (!pending) {
    return;
  }

  // First reply resolves; subsequent replies are ignored
  const replyText = ("text" in message && message.text) || "(empty message)";

  // Clean up timers
  if (pending.timeoutId) clearTimeout(pending.timeoutId);
  if (pending.keepaliveId) clearInterval(pending.keepaliveId);

  pendingQuestions.delete(message.thread_ts);
  pending.resolve(replyText);
});

// --- MCP server setup ---

const mcpServer = new McpServer({
  name: "ask-a-human",
  version: "0.1.0",
});

mcpServer.tool(
  "ask_human",
  "Pause execution and ask a human a question via Slack. The human replies in a Slack thread and execution resumes with their answer.",
  {
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
  async ({ question, context, options }) => {
    // Build Block Kit message
    const blocks: KnownBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:robot_face: *Claude Code needs your input*${SLACK_USER_ID ? `\n<@${SLACK_USER_ID}>` : ""}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Question:*\n${question}`,
        },
      },
    ];

    if (context) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Context:*\n${context}`,
        },
      });
    }

    if (options && options.length > 0) {
      const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Options:*\n${optionsList}`,
        },
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":thread: Reply in this thread to respond",
        },
      ],
    });

    // Post message to Slack
    const result = await slackApp.client.chat.postMessage({
      channel: SLACK_CHANNEL_ID,
      text: `Claude Code needs your input: ${question}`,
      blocks,
    });

    const messageTs = result.ts;
    if (!messageTs) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Failed to post message to Slack (no message timestamp returned)",
          },
        ],
        isError: true,
      };
    }

    // Wait for reply with keepalives and optional timeout
    const reply = await new Promise<string>((resolve) => {
      const pending: PendingQuestion = { resolve };

      // Progress keepalives every 25 seconds
      pending.keepaliveId = setInterval(() => {
        mcpServer.server.sendLoggingMessage({
          level: "info",
          data: "Waiting for human reply on Slack...",
        });
      }, 25_000);

      // Optional timeout
      if (ASK_TIMEOUT_MS > 0) {
        pending.timeoutId = setTimeout(() => {
          if (pending.keepaliveId) clearInterval(pending.keepaliveId);
          pendingQuestions.delete(messageTs);
          resolve("__TIMEOUT__");
        }, ASK_TIMEOUT_MS);
      }

      pendingQuestions.set(messageTs, pending);
    });

    if (reply === "__TIMEOUT__") {
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

    return {
      content: [{ type: "text" as const, text: reply }],
    };
  },
);

// --- Startup sequence ---

async function main() {
  // 1. Start Slack first to ensure WebSocket is ready
  await slackApp.start();
  console.error("Slack app started (Socket Mode)");

  // 2. Connect MCP server to stdio transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("MCP server connected (stdio)");
}

// --- Graceful shutdown ---

process.on("SIGINT", async () => {
  console.error("Shutting down...");

  // Clean up all pending questions
  for (const [ts, pending] of pendingQuestions) {
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    if (pending.keepaliveId) clearInterval(pending.keepaliveId);
    pending.resolve("(server shutting down)");
    pendingQuestions.delete(ts);
  }

  await slackApp.stop();
  await mcpServer.close();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
