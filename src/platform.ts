import type { QuestionResult } from "./helpers.js";

export interface QuestionParams {
  question: string;
  context?: string;
  options?: string[];
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

export type PlatformName = "discord" | "slack";

export function detectPlatform(): PlatformName {
  const hasDiscord = !!process.env.DISCORD_BOT_TOKEN;
  const hasSlack = !!process.env.SLACK_BOT_TOKEN;

  if (hasDiscord && hasSlack) {
    console.error(
      "Both DISCORD_BOT_TOKEN and SLACK_BOT_TOKEN are set. Configure one platform per MCP server instance.",
    );
    process.exit(1);
  }

  if (!hasDiscord && !hasSlack) {
    console.error(
      "Neither DISCORD_BOT_TOKEN nor SLACK_BOT_TOKEN is set. Set environment variables for one platform.",
    );
    process.exit(1);
  }

  return hasDiscord ? "discord" : "slack";
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
  }
}
