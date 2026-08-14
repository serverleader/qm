import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeXaiSandboxEnv, xaiSandboxEnvPatch } from "../src/model/xai-sandbox-env.ts";

test("xaiSandboxEnvPatch injects the SuperGrok token as XAI_API_KEY and prefers Grok", () => {
  assert.deepEqual(xaiSandboxEnvPatch({ token: " jwt ", authMode: "oauth" }), {
    XAI_API_KEY: "jwt",
    XAI_AUTH_MODE: "oauth",
    SUPERGROK: "1",
    OPENMONTAGE_PREFERRED_PROVIDER: "grok",
  });
});

test("xaiSandboxEnvPatch with an API key does not set SuperGrok flags", () => {
  assert.deepEqual(xaiSandboxEnvPatch({ token: "xai-key", authMode: "api_key" }), {
    XAI_API_KEY: "xai-key",
  });
});

test("xaiSandboxEnvPatch is empty when SuperGrok is absent", () => {
  assert.deepEqual(xaiSandboxEnvPatch({ token: "  ", authMode: "absent" }), {});
});

test("mergeXaiSandboxEnv does not overwrite an existing XAI_API_KEY", () => {
  const merged = mergeXaiSandboxEnv(
    { XAI_API_KEY: "from-keychain", PATH: "/usr/bin" },
    { token: "oauth-jwt", authMode: "oauth" },
  );
  assert.equal(merged.XAI_API_KEY, "from-keychain");
  assert.equal(merged.SUPERGROK, "1");
  assert.equal(merged.OPENMONTAGE_PREFERRED_PROVIDER, "grok");
  assert.equal(merged.PATH, "/usr/bin");
});
