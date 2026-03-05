import { App, LogLevel } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";
import { SENTINEL_CANCELLED, SENTINEL_SHUTDOWN } from "../helpers.js";
import type { QuestionResult } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";

interface ReplyResolver {
  resolve: (reply: QuestionResult) => void;
}

export class SlackPlatform implements Platform {
  readonly name = "Slack";

  private app: App | null = null;
  private channelId: string | null = null;
  private userId: string | undefined;
  private replyResolvers = new Map<string, ReplyResolver>();

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

    const text = this.userId
      ? `<@${this.userId}> ${params.question}`
      : params.question;

    const result = await this.app.client.chat.postMessage({
      channel: this.channelId,
      text,
    });

    if (!result.ts) {
      throw new Error("chat.postMessage did not return a message timestamp");
    }
    return `${this.channelId}:${result.ts}`;
  }

  waitForReply(key: string): Promise<QuestionResult> {
    return new Promise<QuestionResult>((resolve) => {
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
