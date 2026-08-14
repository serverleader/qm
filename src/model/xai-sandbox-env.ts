import type { XaiAuthMode } from "./model-credential-store.ts";

export interface XaiSandboxEnvInput {
  token?: string | null;
  authMode?: XaiAuthMode;
}

/** Env OpenMontage (and other sandbox tools) use for SuperGrok / xAI generation. */
export function xaiSandboxEnvPatch(input: XaiSandboxEnvInput): Record<string, string> {
  const patch: Record<string, string> = {};
  const token = input.token?.trim();
  if (token) patch.XAI_API_KEY = token;
  if (input.authMode === "oauth") {
    patch.XAI_AUTH_MODE = "oauth";
    patch.SUPERGROK = "1";
    patch.OPENMONTAGE_PREFERRED_PROVIDER = "grok";
  }
  return patch;
}

export function mergeXaiSandboxEnv(
  env: Record<string, string>,
  input: XaiSandboxEnvInput,
): Record<string, string> {
  const next = { ...env };
  for (const [key, value] of Object.entries(xaiSandboxEnvPatch(input))) {
    if (!(key in next)) next[key] = value;
  }
  return next;
}
