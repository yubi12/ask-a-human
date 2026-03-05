import {
  Client,
  Events,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { truncate, SENTINEL_CANCELLED, SENTINEL_SHUTDOWN } from "../helpers.js";
import type { QuestionResult } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";

const MESSAGE_CONTENT_LIMIT = 2000;
const THREAD_NAME_LIMIT = 100;

interface ReplyResolver {
  resolve: (reply: QuestionResult) => void;
}

export class DiscordPlatform implements Platform {
  readonly name = "Discord";

  private client: Client;
  private channel: GuildTextBasedChannel | null = null;
  private userId: string | undefined;
  private replyResolvers = new Map<string, ReplyResolver>();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.on(Events.MessageCreate, (message) => {
      if (message.author.bot) return;
      if (!message.channel.isThread()) return;

      const resolver = this.replyResolvers.get(message.channelId);
      if (!resolver) return;

      const replyText = message.content || "(empty message)";
      this.replyResolvers.delete(message.channelId);
      resolver.resolve(replyText);
    });
  }

  async connect(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!token) {
      throw new Error("Missing DISCORD_BOT_TOKEN");
    }
    if (!channelId) {
      throw new Error("Missing DISCORD_CHANNEL_ID");
    }

    const readyPromise = new Promise<void>((resolve) => {
      this.client.once(Events.ClientReady, () => resolve());
    });
    await this.client.login(token);
    await readyPromise;
    console.error("Discord client ready");

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error(
        "Configured DISCORD_CHANNEL_ID is not a valid guild text channel",
      );
    }
    this.channel = channel as GuildTextBasedChannel;
    this.userId = process.env.DISCORD_USER_ID;
    console.error(`Target channel: ${channelId}`);
  }

  async postQuestion(params: QuestionParams): Promise<string> {
    if (!this.channel) throw new Error("Not connected");

    // Follow-up in existing thread (skip @mention — user is already engaged)
    if (params.thread_id) {
      const thread = await this.client.channels.fetch(params.thread_id);
      if (!thread || !thread.isThread()) {
        throw new Error(`Invalid thread_id: ${params.thread_id} is not a thread`);
      }
      await thread.send(truncate(params.question, MESSAGE_CONTENT_LIMIT));
      return params.thread_id;
    }

    // New question — post to channel and start a thread
    const content = this.userId
      ? `<@${this.userId}>\n\n${params.question}`
      : params.question;

    const sentMessage = await this.channel.send(
      truncate(content, MESSAGE_CONTENT_LIMIT),
    );

    const thread = await sentMessage.startThread({
      name: truncate(params.question, THREAD_NAME_LIMIT),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });

    return thread.id;
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
    this.client.destroy();
  }
}
