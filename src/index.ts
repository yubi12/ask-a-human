#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  SENTINEL_CANCELLED,
  SENTINEL_TIMEOUT,
  SENTINEL_SHUTDOWN,
} from "./helpers.js";
import type { QuestionResult } from "./helpers.js";
import { detectPlatform, createPlatform } from "./platform.js";
import type { Platform } from "./platform.js";

// --- Environment ---

const ASK_TIMEOUT_MS =
  Number(process.env.ASK_TIMEOUT_MS) || 5 * 60 * 60 * 1000; // 5 hours default

// --- Pending questions tracking ---

interface PendingQuestion {
  key: string;
  timeoutId?: ReturnType<typeof setTimeout>;
  keepaliveId?: ReturnType<typeof setInterval>;
  abortHandler?: () => void;
}

const pendingQuestions = new Map<string, PendingQuestion>();

// --- Platform detection ---

const platformName = detectPlatform();
let platform: Platform;

// --- MCP server setup ---

const mcpServer = new McpServer(
  { name: "ask-a-human", version: "0.2.0" },
  { capabilities: { logging: {}, tools: {} } },
);

mcpServer.registerTool("ask_human", {
  title: "Ask a Human",
  description: `Pause execution and ask a human a question via ${platformName === "discord" ? "Discord" : "Slack"}. The human replies in a thread and execution resumes with their answer.`,
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
  const key = await platform.postQuestion({ question, context, options });

  // Set up cleanup helpers
  const pending: PendingQuestion = { key };

  function cleanup(sentinel: typeof SENTINEL_CANCELLED | typeof SENTINEL_TIMEOUT) {
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    if (pending.keepaliveId) clearInterval(pending.keepaliveId);
    pendingQuestions.delete(key);
    platform.cancelWait(key);
  }

  // Handle client-initiated cancellation via AbortSignal
  const abortHandler = () => cleanup(SENTINEL_CANCELLED);
  pending.abortHandler = abortHandler;
  extra.signal.addEventListener("abort", abortHandler, { once: true });

  // Progress keepalives every 25 seconds
  pending.keepaliveId = setInterval(() => {
    mcpServer.sendLoggingMessage({
      level: "info",
      data: `Waiting for human reply on ${platform.name}...`,
    });
  }, 25_000);

  // Optional timeout
  let timeoutResolve: ((result: QuestionResult) => void) | undefined;
  const timeoutPromise = new Promise<QuestionResult>((resolve) => {
    if (ASK_TIMEOUT_MS > 0) {
      timeoutResolve = resolve;
      pending.timeoutId = setTimeout(() => resolve(SENTINEL_TIMEOUT), ASK_TIMEOUT_MS);
    }
  });

  pendingQuestions.set(key, pending);

  // Race between platform reply and timeout
  const replyPromise = platform.waitForReply(key);
  const reply = ASK_TIMEOUT_MS > 0
    ? await Promise.race([replyPromise, timeoutPromise])
    : await replyPromise;

  // Clean up timers
  if (pending.timeoutId) clearTimeout(pending.timeoutId);
  if (pending.keepaliveId) clearInterval(pending.keepaliveId);
  extra.signal.removeEventListener("abort", abortHandler);
  pendingQuestions.delete(key);

  // If timeout won, cancel the platform wait
  if (reply === SENTINEL_TIMEOUT) {
    platform.cancelWait(key);
  }

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
  // 1. Create and connect the platform
  platform = await createPlatform(platformName);
  await platform.connect();

  // 2. Connect MCP server to stdio transport
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
  }
  pendingQuestions.clear();

  // Disconnect platform (resolves any pending waitForReply with cleanup)
  await platform.disconnect();
  await mcpServer.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
