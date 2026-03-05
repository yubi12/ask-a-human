import { Bot } from "grammy";
import { truncate, SENTINEL_CANCELLED, SENTINEL_SHUTDOWN } from "../helpers.js";
import type { QuestionResult } from "../helpers.js";
import type { Platform, QuestionParams } from "../platform.js";

const MESSAGE_CONTENT_LIMIT = 4096;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ReplyResolver {
  resolve: (reply: QuestionResult) => void;
}

export class TelegramPlatform implements Platform {
  readonly name = "Telegram";

  private bot: Bot | null = null;
  private chatId: string | null = null;
  private userId: string | undefined;
  private replyResolvers = new Map<string, ReplyResolver>();

  async connect(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID ?? null;
    this.userId = process.env.TELEGRAM_USER_ID;

    if (!token) {
      throw new Error("Missing TELEGRAM_BOT_TOKEN");
    }
    if (!this.chatId) {
      throw new Error("Missing TELEGRAM_CHAT_ID");
    }

    this.bot = new Bot(token);

    // Listen for text messages that are replies to the bot's messages
    this.bot.on("message:text", (ctx) => {
      // Only process replies to existing messages
      if (!ctx.message.reply_to_message) return;

      // Filter out bot messages
      if (ctx.message.from.is_bot) return;

      const chatId = ctx.message.chat.id.toString();
      const originalMessageId = ctx.message.reply_to_message.message_id;
      const key = `${chatId}:${originalMessageId}`;

      const resolver = this.replyResolvers.get(key);
      if (!resolver) return;

      this.replyResolvers.delete(key);
      resolver.resolve(ctx.message.text || "(empty message)");
    });

    // Handle errors in middleware to prevent unhandled rejections
    this.bot.catch((err) => {
      console.error("Telegram bot error:", err);
    });

    // Start long polling (non-blocking — bot.start() runs in background)
    this.bot.start().catch((err) => {
      console.error("Telegram polling error:", err);
    });
    console.error("Telegram bot ready (long polling)");
    console.error(`Target chat: ${this.chatId}`);
  }

  async postQuestion(params: QuestionParams): Promise<string> {
    if (!this.bot || !this.chatId) throw new Error("Not connected");

    // Follow-up in existing thread (skip @mention — user is already engaged)
    // thread_id support comes from PR #5; access via cast until merged
    const threadId = (params as QuestionParams & { thread_id?: string })
      .thread_id;
    if (threadId) {
      const colonIdx = threadId.indexOf(":");
      if (colonIdx === -1) {
        throw new Error(
          'Invalid thread_id format: expected "chatId:messageId"',
        );
      }
      const chatId = threadId.slice(0, colonIdx);
      const messageId = Number(threadId.slice(colonIdx + 1));
      if (isNaN(messageId)) {
        throw new Error("Invalid message ID in thread_id");
      }

      const sentMessage = await this.bot.api.sendMessage(
        chatId,
        truncate(params.question, MESSAGE_CONTENT_LIMIT),
        { reply_parameters: { message_id: messageId } },
      );

      // Return key for the NEW message so reply matching works
      return `${chatId}:${sentMessage.message_id}`;
    }

    // New question — post with ForceReply and optional @mention
    const question = truncate(params.question, MESSAGE_CONTENT_LIMIT);

    if (this.userId) {
      const mention = `<a href="tg://user?id=${this.userId}">Hey</a>`;
      const text = `${mention} ${escapeHtml(question)}`;
      const sentMessage = await this.bot.api.sendMessage(
        this.chatId,
        text,
        {
          parse_mode: "HTML",
          reply_markup: { force_reply: true, selective: true },
        },
      );
      return `${this.chatId}:${sentMessage.message_id}`;
    }

    const sentMessage = await this.bot.api.sendMessage(
      this.chatId,
      question,
      { reply_markup: { force_reply: true } },
    );
    return `${this.chatId}:${sentMessage.message_id}`;
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
    if (this.bot) {
      await this.bot.stop();
    }
  }
}
