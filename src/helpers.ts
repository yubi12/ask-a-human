// Sentinels use Symbols to prevent collision with user input
export const SENTINEL_CANCELLED = Symbol("cancelled");
export const SENTINEL_TIMEOUT = Symbol("timeout");
export const SENTINEL_SHUTDOWN = Symbol("shutdown");

export type QuestionResult =
  | string
  | typeof SENTINEL_CANCELLED
  | typeof SENTINEL_TIMEOUT
  | typeof SENTINEL_SHUTDOWN;

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
