import { sleep } from "../util/async.ts";

const VIDEO_START_URL = "https://api.x.ai/v1/videos/generations";
const VIDEO_STATUS_URL = "https://api.x.ai/v1/videos";
const POLL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export function isXaiImagineVideoModel(id: string): boolean {
  return id === "grok-imagine-video" || id.startsWith("grok-imagine-video-");
}

export interface XaiImagineVideoInput {
  accessToken: string;
  modelId: string;
  prompt: string;
  image?: { mimeType: string; dataBase64: string };
  durationSec?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export interface XaiImagineVideoResult {
  url: string;
  duration?: number;
  model: string;
}

export function imagineVideoDurationFromPrompt(prompt: string): number | undefined {
  const match = prompt.match(/\b(\d{1,2})\s*(?:s|sec|secs|second|seconds)\b/i);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return undefined;
  return Math.min(15, Math.max(1, seconds));
}

export function formatImagineVideoReply(result: XaiImagineVideoResult): string {
  const duration = result.duration ? ` (${result.duration}s)` : "";
  return [
    `Generated a video with ${result.model}${duration}.`,
    "",
    `[Watch the video](${result.url})`,
    "",
    "The link is temporary. Download it if you want to keep a copy.",
  ].join("\n");
}

export async function generateXaiVideo(input: XaiImagineVideoInput): Promise<XaiImagineVideoResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Imagine Video needs a prompt");
  if (!input.accessToken.trim()) throw new Error("SuperGrok or an xAI API key is required for Imagine Video");
  const fetcher = input.fetcher ?? fetch;
  const duration = input.durationSec ?? imagineVideoDurationFromPrompt(prompt) ?? 6;
  const model = input.modelId.startsWith("grok-imagine-video-1.5") ? "grok-imagine-video-1.5" : input.modelId;
  const body: Record<string, unknown> = {
    model,
    prompt,
    duration,
    aspect_ratio: "16:9",
    resolution: model === "grok-imagine-video-1.5" ? "720p" : "480p",
  };
  if (input.image?.dataBase64) {
    body.image = `data:${input.image.mimeType || "image/png"};base64,${input.image.dataBase64}`;
  }
  const started = await fetcher(VIDEO_START_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const startedPayload = (await started.json().catch(() => ({}))) as { request_id?: string; error?: unknown };
  if (!started.ok || !startedPayload.request_id) {
    throw new Error(`Imagine Video start failed (${started.status})`);
  }
  const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  while (Date.now() < deadline) {
    const status = await fetcher(`${VIDEO_STATUS_URL}/${startedPayload.request_id}`, {
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await status.json().catch(() => ({}))) as {
      status?: string;
      video?: { url?: string; duration?: number };
      model?: string;
    };
    if (payload.status === "done" && payload.video?.url) {
      return {
        url: payload.video.url,
        ...(typeof payload.video.duration === "number" ? { duration: payload.video.duration } : {}),
        model: payload.model || model,
      };
    }
    if (payload.status === "failed" || payload.status === "expired") {
      throw new Error(`Imagine Video ${payload.status}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error("Imagine Video timed out");
}
