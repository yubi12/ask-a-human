import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ThreadAutoArchiveDuration,
} from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { truncate } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";
import type { QuestionResult } from "../helpers.js";

const EMBED_DESCRIPTION_LIMIT = 4000;
const EMBED_FIELD_VALUE_LIMIT = 1000;
const THREAD_NAME_LIMIT = 100;

type ReplyResolver = (result: QuestionResult) => void;

export class DiscordPlatform implements Platform {
  readonly name = "Discord";

  private client: Client;
  private targetChannel!: GuildTextBasedChannel;
  private replyResolvers = new Map<string, ReplyResolver>();

  private readonly token: string;
  private readonly channelId: string;
  private readonly userId?: string;

  constructor() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!token) {
      console.error("Missing DISCORD_BOT_TOKEN");
      process.exit(1);
    }
    if (!channelId) {
      console.error("Missing DISCORD_CHANNEL_ID");
      process.exit(1);
    }

    this.token = token;
    this.channelId = channelId;
    this.userId = process.env.DISCORD_USER_ID;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Listen for thread replies
    this.client.on(Events.MessageCreate, (message) => {
      if (message.author.bot) return;
      if (!message.channel.isThread()) return;

      const resolver = this.replyResolvers.get(message.channelId);
      if (!resolver) return;

      this.replyResolvers.delete(message.channelId);
      resolver(message.content || "(empty message)");
    });
  }

  async connect(): Promise<void> {
    const readyPromise = new Promise<void>((resolve) => {
      this.client.once(Events.ClientReady, () => resolve());
    });
    await this.client.login(this.token);
    await readyPromise;
    console.error("Discord client ready");

    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      console.error(
        "Configured DISCORD_CHANNEL_ID is not a valid guild text channel",
      );
      process.exit(1);
    }
    this.targetChannel = channel as GuildTextBasedChannel;
    console.error(`Target channel: ${this.channelId}`);
  }

  async postQuestion(params: QuestionParams): Promise<string> {
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

    const sentMessage = await this.targetChannel.send({
      content: this.userId ? `<@${this.userId}>` : undefined,
      embeds: [embed],
    });

    const thread = await sentMessage.startThread({
      name: truncate(`Question: ${params.question}`, THREAD_NAME_LIMIT),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });

    return thread.id;
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
    await this.client.destroy();
  }
}
