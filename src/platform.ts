import type { QuestionResult } from "./helpers.js";

export interface QuestionParams {
  question: string;
  context?: string;
  options?: string[];
}

export interface Platform {
  /** Human-readable platform name (e.g. "Discord", "Slack") */
  readonly name: string;

  /** Connect to the platform and cache any startup resources */
  connect(): Promise<void>;

  /** Post a formatted question and return a platform-specific thread key */
  postQuestion(params: QuestionParams): Promise<string>;

  /**
   * Wait for the first human reply on the given thread key.
   * Resolves with the reply text or a sentinel on cancellation.
   */
  waitForReply(
    threadKey: string,
    resolve: (result: QuestionResult) => void,
  ): void;

  /** Cancel a pending wait (e.g. on timeout or abort) */
  cancelWait(threadKey: string): void;

  /** Disconnect and clean up resources */
  disconnect(): Promise<void>;
}

type PlatformName = "discord" | "slack";

export function detectPlatform(): PlatformName {
  const hasDiscord = Boolean(process.env.DISCORD_BOT_TOKEN);
  const hasSlack = Boolean(process.env.SLACK_BOT_TOKEN);

  if (hasDiscord && hasSlack) {
    console.error(
      "Both DISCORD_BOT_TOKEN and SLACK_BOT_TOKEN are set. " +
        "Configure one platform per MCP server instance. " +
        "For multiple platforms, add separate MCP entries.",
    );
    process.exit(1);
  }

  if (!hasDiscord && !hasSlack) {
    console.error(
      "Neither DISCORD_BOT_TOKEN nor SLACK_BOT_TOKEN is set. " +
        "Set the environment variables for one platform.",
    );
    process.exit(1);
  }

  return hasDiscord ? "discord" : "slack";
}

export async function createPlatform(name: PlatformName): Promise<Platform> {
  if (name === "discord") {
    const { DiscordPlatform } = await import("./platforms/discord.js");
    return new DiscordPlatform();
  }
  const { SlackPlatform } = await import("./platforms/slack.js");
  return new SlackPlatform();
}
