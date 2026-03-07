import type { QuestionResult } from "./helpers.js";

export interface QuestionParams {
  question: string;
  thread_id?: string;
}

export interface Platform {
  /** Human-readable name for this platform (e.g. "Discord", "Slack") */
  readonly name: string;

  /** Connect to the platform (login, open WebSocket, etc.) */
  connect(): Promise<void>;

  /** Post a question and return an opaque key for waitForReply/cancelWait */
  postQuestion(params: QuestionParams): Promise<string>;

  /** Block until a reply arrives for the given key */
  waitForReply(key: string): Promise<QuestionResult>;

  /** Cancel a pending wait (e.g. on abort signal) */
  cancelWait(key: string): void;

  /** Disconnect from the platform */
  disconnect(): Promise<void>;
}

export type PlatformName = "discord" | "slack" | "telegram";

export function detectPlatform(): PlatformName {
  const hasDiscord = !!process.env.DISCORD_BOT_TOKEN;
  const hasSlack = !!process.env.SLACK_BOT_TOKEN;
  const hasTelegram = !!process.env.TELEGRAM_BOT_TOKEN;

  const count = [hasDiscord, hasSlack, hasTelegram].filter(Boolean).length;

  if (count > 1) {
    throw new Error(
      "Multiple platform tokens are set. Configure one platform per MCP server instance.",
    );
  }

  if (count === 0) {
    throw new Error(
      "No platform token is set. Set DISCORD_BOT_TOKEN, SLACK_BOT_TOKEN, or TELEGRAM_BOT_TOKEN.",
    );
  }

  if (hasDiscord) return "discord";
  if (hasSlack) return "slack";
  return "telegram";
}

export async function createPlatform(name: PlatformName): Promise<Platform> {
  switch (name) {
    case "discord": {
      const { DiscordPlatform } = await import("./platforms/discord.js");
      return new DiscordPlatform();
    }
    case "slack": {
      const { SlackPlatform } = await import("./platforms/slack.js");
      return new SlackPlatform();
    }
    case "telegram": {
      const { TelegramPlatform } = await import("./platforms/telegram.js");
      return new TelegramPlatform();
    }
  }
}
