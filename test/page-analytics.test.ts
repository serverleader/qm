import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("checked-in page shells do not hardcode a tracker", () => {
  for (const rel of ["plugins/web-ui/index.html", "plugins/admin/public/index.html"]) {
    const text = readFileSync(join(root, rel), "utf8");
    assert.doesNotMatch(text, /data-site-id=/, rel);
    assert.doesNotMatch(text, /\/api\/script\.js/, rel);
  }
});

test("analytics injects only when origin and site id are set", async () => {
  const prevOrigin = process.env.ANALYTICS_ORIGIN;
  const prevSite = process.env.ANALYTICS_SITE_ID;
  try {
    process.env.ANALYTICS_ORIGIN = "https://analytics.example.test";
    process.env.ANALYTICS_SITE_ID = "site-test-1";
    const { injectAnalyticsHead, analyticsScriptTag, analyticsCspSource } = await import(
      "../plugins/chassis/src/analytics.ts"
    );
    assert.match(analyticsScriptTag(), /https:\/\/analytics\.example\.test\/api\/script\.js/);
    assert.match(analyticsScriptTag(), /data-site-id="site-test-1"/);
    assert.equal(analyticsCspSource(), " https://analytics.example.test");
    assert.match(injectAnalyticsHead("<html><head></head><body></body></html>"), /analytics\.example\.test/);
  } finally {
    if (prevOrigin === undefined) delete process.env.ANALYTICS_ORIGIN;
    else process.env.ANALYTICS_ORIGIN = prevOrigin;
    if (prevSite === undefined) delete process.env.ANALYTICS_SITE_ID;
    else process.env.ANALYTICS_SITE_ID = prevSite;
  }
});
