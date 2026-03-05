import { App, LogLevel } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";
import { truncate, SENTINEL_CANCELLED, SENTINEL_SHUTDOWN } from "../helpers.js";
import type { QuestionResult } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";

const HEADER_TEXT_LIMIT = 150;
const SECTION_TEXT_LIMIT = 3000;

export class SlackPlatform implements Platform {
  readonly name = "Slack";
  private app: App | null = null;
  private channelId: string | null = null;
  private userId?: string;
  private replyResolvers = new Map<
    string,
    { resolve: (r: QuestionResult) => void }
  >();

  async connect(): Promise<void> {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const appToken = process.env.SLACK_APP_TOKEN;
    this.channelId = process.env.SLACK_CHANNEL_ID ?? null;
    this.userId = process.env.SLACK_USER_ID;

    if (!botToken) {
      throw new Error("Missing SLACK_BOT_TOKEN");
    }
    if (!appToken) {
      throw new Error("Missing SLACK_APP_TOKEN");
    }
    if (!this.channelId) {
      throw new Error("Missing SLACK_CHANNEL_ID");
    }

    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
      logLevel: LogLevel.ERROR,
    });

    // Listen for thread replies
    this.app.message(async ({ message }) => {
      // Only process generic messages (no subtypes like edits, deletes, etc.)
      if (message.subtype !== undefined) return;

      const msg = message as GenericMessageEvent;
      // Only thread replies
      if (!msg.thread_ts) return;
      // Filter out bot messages
      if (msg.bot_id) return;

      const key = `${msg.channel}:${msg.thread_ts}`;
      const resolver = this.replyResolvers.get(key);
      if (!resolver) return;

      this.replyResolvers.delete(key);
      resolver.resolve(msg.text || "(empty message)");
    });

    await this.app.start();
    console.error("Slack client ready (Socket Mode)");
    console.error(`Target channel: ${this.channelId}`);
  }

  async postQuestion(params: QuestionParams): Promise<string> {
    if (!this.app || !this.channelId) throw new Error("Not connected");

    // Follow-up in existing thread
    if (params.thread_id) {
      const [channelId, threadTs] = params.thread_id.split(":");
      if (!channelId || !threadTs) {
        throw new Error(
          `Invalid thread_id format: expected "channelId:timestamp"`,
        );
      }

      const mention = this.userId ? `<@${this.userId}> ` : "";
      await this.app.client.chat.postMessage({
        channel: channelId,
        text: `${mention}${params.question}`,
        thread_ts: threadTs,
      });

      return params.thread_id;
    }

    // New question — post to channel
    const blocks = [
      {
        type: "header" as const,
        text: {
          type: "plain_text" as const,
          text: truncate("Claude Code needs your input", HEADER_TEXT_LIMIT),
          emoji: true,
        },
      },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: truncate(params.question, SECTION_TEXT_LIMIT),
        },
      },
    ];

    if (params.context) {
      blocks.push({
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: truncate(`*Context:* ${params.context}`, SECTION_TEXT_LIMIT),
        },
      });
    }

    if (params.options && params.options.length > 0) {
      const optionsList = params.options
        .map((o, i) => `${i + 1}. ${o}`)
        .join("\n");
      blocks.push({
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: truncate(`*Options:*\n${optionsList}`, SECTION_TEXT_LIMIT),
        },
      });
    }

    const contextBlock = {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: "Reply in this thread to respond",
        },
      ],
    };

    const mentionText = this.userId
      ? `<@${this.userId}> Claude Code needs your input`
      : "Claude Code needs your input";

    const result = await this.app.client.chat.postMessage({
      channel: this.channelId,
      text: mentionText,
      blocks: [...blocks, contextBlock],
    });

    const messageTs = result.ts;
    if (!messageTs) {
      throw new Error("Slack API did not return a message timestamp");
    }
    return `${this.channelId}:${messageTs}`;
  }

  waitForReply(key: string): Promise<QuestionResult> {
    return new Promise((resolve) => {
      this.replyResolvers.set(key, { resolve });
    });
  }

  cancelWait(key: string): void {
    const resolver = this.replyResolvers.get(key);
    if (resolver) {
      this.replyResolvers.delete(key);
      resolver.resolve(SENTINEL_CANCELLED);
    }
  }

  async disconnect(): Promise<void> {
    for (const [, resolver] of this.replyResolvers) {
      resolver.resolve(SENTINEL_SHUTDOWN);
    }
    this.replyResolvers.clear();
    if (this.app) {
      await this.app.stop();
    }
  }
}
