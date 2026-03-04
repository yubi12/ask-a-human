import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { truncate, SENTINEL_CANCELLED } from "../helpers.js";
import type { QuestionResult } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";

const EMBED_DESCRIPTION_LIMIT = 4000;
const EMBED_FIELD_VALUE_LIMIT = 1000;
const THREAD_NAME_LIMIT = 100;

interface ReplyResolver {
  resolve: (reply: QuestionResult) => void;
}

export class DiscordPlatform implements Platform {
  readonly name = "Discord";

  private client: Client;
  private channel: GuildTextBasedChannel | null = null;
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
    console.error(`Target channel: ${channelId}`);
  }

  async postQuestion(params: QuestionParams): Promise<string> {
    if (!this.channel) throw new Error("Not connected");

    const userId = process.env.DISCORD_USER_ID;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Claude Code needs your input")
      .setDescription(truncate(params.question, EMBED_DESCRIPTION_LIMIT))
      .setFooter({ text: "Reply in this thread to respond" });

    if (params.context) {
      embed.addFields({
        name: "Context",
        value: truncate(params.context, EMBED_FIELD_VALUE_LIMIT),
      });
    }

    if (params.options && params.options.length > 0) {
      const optionsList = params.options
        .map((o, i) => `${i + 1}. ${o}`)
        .join("\n");
      embed.addFields({
        name: "Options",
        value: truncate(optionsList, EMBED_FIELD_VALUE_LIMIT),
      });
    }

    const sentMessage = await this.channel.send({
      content: userId ? `<@${userId}>` : undefined,
      embeds: [embed],
    });

    const thread = await sentMessage.startThread({
      name: truncate(`Question: ${params.question}`, THREAD_NAME_LIMIT),
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
    this.replyResolvers.clear();
    this.client.destroy();
  }
}
