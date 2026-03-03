import { App, LogLevel } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { truncate } from "../helpers.js";
import type { QuestionResult } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";

const HEADER_LIMIT = 150;
const SECTION_LIMIT = 3000;

type ReplyResolver = (result: QuestionResult) => void;

export class SlackPlatform implements Platform {
  readonly name = "Slack";

  private app: App;
  private replyResolvers = new Map<string, ReplyResolver>();

  private readonly channelId: string;
  private readonly userId?: string;

  constructor() {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const appToken = process.env.SLACK_APP_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_ID;

    if (!botToken) {
      console.error("Missing SLACK_BOT_TOKEN");
      process.exit(1);
    }
    if (!appToken) {
      console.error("Missing SLACK_APP_TOKEN (app-level token with connections:write scope)");
      process.exit(1);
    }
    if (!channelId) {
      console.error("Missing SLACK_CHANNEL_ID");
      process.exit(1);
    }

    this.channelId = channelId;
    this.userId = process.env.SLACK_USER_ID;

    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      logLevel: LogLevel.ERROR,
    });

    // Listen for thread replies
    this.app.message(async ({ message }) => {
      // Only process thread replies
      if (!("thread_ts" in message) || !message.thread_ts) return;

      // Skip bot messages and subtypes (edits, deletes, etc.)
      if ("bot_id" in message && message.bot_id) return;
      if ("subtype" in message && message.subtype) return;

      const resolver = this.replyResolvers.get(message.thread_ts);
      if (!resolver) return;

      this.replyResolvers.delete(message.thread_ts);
      resolver(("text" in message && message.text) || "(empty message)");
    });
  }

  async connect(): Promise<void> {
    await this.app.start();
    console.error("Slack app connected (Socket Mode)");
    console.error(`Target channel: ${this.channelId}`);
  }

  async postQuestion(params: QuestionParams): Promise<string> {
    const blocks: KnownBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: truncate("Claude Code needs your input", HEADER_LIMIT),
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: truncate(params.question, SECTION_LIMIT),
        },
      },
    ];

    if (params.context) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Context:*\n${truncate(params.context, SECTION_LIMIT - 12)}`,
        },
      });
    }

    if (params.options && params.options.length > 0) {
      const optionsList = params.options
        .map((o, i) => `${i + 1}. ${o}`)
        .join("\n");
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Options:*\n${truncate(optionsList, SECTION_LIMIT - 12)}`,
        },
      });
    }

    // Footer context
    const mentionText = this.userId ? `<@${this.userId}> — ` : "";
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${mentionText}Reply in this thread to respond`,
        },
      ],
    });

    const result = await this.app.client.chat.postMessage({
      channel: this.channelId,
      text: "Claude Code needs your input",
      blocks,
    });

    if (!result.ts) {
      throw new Error("Slack chat.postMessage did not return a message ts");
    }

    return result.ts;
  }

  waitForReply(
    threadKey: string,
    resolve: (result: QuestionResult) => void,
  ): void {
    this.replyResolvers.set(threadKey, resolve);
  }

  cancelWait(threadKey: string): void {
    this.replyResolvers.delete(threadKey);
  }

  async disconnect(): Promise<void> {
    await this.app.stop();
  }
}
