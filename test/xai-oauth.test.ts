import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyXaiSubscriptionRouting,
  pollXaiDeviceLogin,
  resetXaiOAuthForTests,
  startXaiDeviceLogin,
  XAI_CLI_PROXY_BASE_URL,
} from "../src/model/xai-oauth.ts";
import { getRequiredModel } from "../src/model/pi-models.ts";

test("device-code start returns a user code and hides the device_code", async () => {
  resetXaiOAuthForTests();
  const started = await startXaiDeviceLogin(async (url, init) => {
    assert.equal(String(url), "https://auth.x.ai/oauth2/device/code");
    assert.equal((init as RequestInit).method, "POST");
    return new Response(
      JSON.stringify({
        device_code: "secret-device-code",
        user_code: "ABCD-1234",
        verification_uri: "https://auth.x.ai/device",
        verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-1234",
        expires_in: 600,
        interval: 5,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  assert.equal(started.userCode, "ABCD-1234");
  assert.equal(started.verificationUri, "https://auth.x.ai/device");
  assert.match(started.verificationUriComplete ?? "", /ABCD-1234/);
  assert.equal(started.interval, 5);
  assert.ok(started.sessionId);
  assert.equal(JSON.stringify(started).includes("secret-device-code"), false);
});

test("device-code poll exchanges the hidden device_code for tokens", async () => {
  resetXaiOAuthForTests();
  const started = await startXaiDeviceLogin(async () => {
    return new Response(
      JSON.stringify({
        device_code: "secret-device-code",
        user_code: "WXYZ-9999",
        verification_uri: "https://auth.x.ai/device",
        expires_in: 600,
        interval: 1,
      }),
      { status: 200 },
    );
  });
  let posted = "";
  const pending = await pollXaiDeviceLogin(started.sessionId, async (url, init) => {
    assert.equal(String(url), "https://auth.x.ai/oauth2/token");
    posted = String((init as RequestInit).body);
    return new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 });
  });
  assert.equal(pending.status, "pending");
  assert.match(posted, /secret-device-code/);

  const approved = await pollXaiDeviceLogin(started.sessionId, async () => {
    return new Response(
      JSON.stringify({
        access_token: "xai-access",
        refresh_token: "xai-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      }),
      { status: 200 },
    );
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.credentials?.access, "xai-access");
  assert.equal(approved.credentials?.refresh, "xai-refresh");
  assert.ok((approved.credentials?.expires ?? 0) > Date.now());
});

test("subscription routing sends Grok through the SuperGrok CLI proxy", () => {
  const routed = applyXaiSubscriptionRouting(getRequiredModel("grok-4.6"));
  assert.equal(routed.provider, "xai");
  assert.equal(routed.baseUrl, XAI_CLI_PROXY_BASE_URL);
  assert.equal(routed.headers?.["X-XAI-Token-Auth"], "xai-grok-cli");
  assert.equal(routed.headers?.["x-grok-model-override"], "grok-4.6");
  assert.equal(routed.headers?.["x-grok-client-mode"], "interactive");

  const composer = applyXaiSubscriptionRouting(getRequiredModel("grok-composer-2.5-fast"));
  assert.equal(composer.headers?.["x-grok-model-override"], "grok-composer-2.5-fast");
});
