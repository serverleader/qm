import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatImagineVideoReply,
  generateXaiVideo,
  imagineVideoDurationFromPrompt,
  isXaiImagineVideoModel,
} from "../src/model/xai-imagine-video.ts";
import { applyXaiSubscriptionRouting } from "../src/model/xai-oauth.ts";
import { getRequiredModel } from "../src/model/pi-models.ts";

test("Imagine Video model ids are recognized and stay off the CLI proxy", () => {
  assert.equal(isXaiImagineVideoModel("grok-imagine-video"), true);
  assert.equal(isXaiImagineVideoModel("grok-imagine-video-1.5"), true);
  assert.equal(isXaiImagineVideoModel("grok-4.6"), false);
  const routed = applyXaiSubscriptionRouting(getRequiredModel("grok-imagine-video-1.5"));
  assert.equal(routed.id, "grok-imagine-video-1.5");
});

test("Imagine Video reads an explicit duration from the prompt", () => {
  assert.equal(imagineVideoDurationFromPrompt("make a 10 second clip of rain"), 10);
  assert.equal(imagineVideoDurationFromPrompt("no duration here"), undefined);
});

test("generateXaiVideo starts a job, polls, and returns the video URL", async () => {
  const calls: string[] = [];
  const result = await generateXaiVideo({
    accessToken: "xai-oauth",
    modelId: "grok-imagine-video-1.5",
    prompt: "a fox running through snow, 5 seconds",
    timeoutMs: 20_000,
    fetcher: async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).endsWith("/videos/generations")) {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "grok-imagine-video-1.5");
        assert.equal(body.duration, 5);
        assert.equal(body.resolution, "720p");
        assert.equal(body.image, undefined);
        return new Response(JSON.stringify({ request_id: "vid-1" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          status: "done",
          model: "grok-imagine-video-1.5",
          video: { url: "https://vidgen.x.ai/fox.mp4", duration: 5 },
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(result.url, "https://vidgen.x.ai/fox.mp4");
  assert.equal(result.duration, 5);
  assert.match(formatImagineVideoReply(result), /Watch the video/);
  assert.equal(calls[0], "POST https://api.x.ai/v1/videos/generations");
  assert.equal(calls[1], "GET https://api.x.ai/v1/videos/vid-1");
});

test("generateXaiVideo sends an attached image as ImageUrl.url", async () => {
  let image: unknown;
  await generateXaiVideo({
    accessToken: "xai-oauth",
    modelId: "grok-imagine-video-1.5",
    prompt: "Make the dog go crazy",
    image: { mimeType: "image/png", dataBase64: "abc" },
    timeoutMs: 20_000,
    fetcher: async (url, init) => {
      if (String(url).endsWith("/videos/generations")) {
        image = JSON.parse(String(init?.body)).image;
        return new Response(JSON.stringify({ request_id: "vid-2" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ status: "done", video: { url: "https://vidgen.x.ai/dog.mp4", duration: 6 } }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(image, { url: "data:image/png;base64,abc" });
});

test("Imagine Video start errors include the API message", async () => {
  await assert.rejects(
    generateXaiVideo({
      accessToken: "xai-oauth",
      modelId: "grok-imagine-video-1.5",
      prompt: "Make the dog go crazy",
      fetcher: async () => new Response(JSON.stringify({ error: "expected struct ImageUrl" }), { status: 422 }),
    }),
    /422.*expected struct ImageUrl/,
  );
});
