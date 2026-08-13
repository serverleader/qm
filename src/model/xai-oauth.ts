import { randomBytes } from "node:crypto";
import type { Api, Model } from "@earendil-works/pi-ai";

const DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code";
const DEVICE_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const CLIENT_VERSION = "0.2.101";
const CLIENT_NAME = "grok-shell";
const SCOPE =
  "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const AUTH_MAX_BYTES = 64 * 1024;

export const XAI_CLI_PROXY_BASE_URL = "https://cli-chat-proxy.grok.com/v1";

export interface XaiOAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
  tokenEndpoint: string;
}

export interface XaiDeviceStart {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export type XaiDevicePoll =
  | { status: "pending" | "slow_down" | "denied" | "expired" | "unknown" }
  | { status: "approved"; credentials: XaiOAuthCredentials };

interface PendingDevice {
  deviceCode: string;
  expiresAt: number;
}

const pending = new Map<string, PendingDevice>();
type OAuthFetch = typeof fetch;

function platformLabel(): string {
  const os = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;
  return `${os}; ${arch}`;
}

export function buildXaiProxyHeaders(modelId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": `${CLIENT_NAME}/${CLIENT_VERSION} (${platformLabel()})`,
    "x-grok-client-identifier": CLIENT_NAME,
    "x-grok-client-version": CLIENT_VERSION,
    "x-grok-client-mode": "interactive",
    "X-XAI-Token-Auth": "xai-grok-cli",
    "x-authenticateresponse": "authenticate-response",
    "x-grok-client-surface": "cli",
  };
  if (modelId) headers["x-grok-model-override"] = modelId;
  return headers;
}

export function applyXaiSubscriptionRouting<T extends Model<Api>>(model: T): T {
  return {
    ...model,
    baseUrl: XAI_CLI_PROXY_BASE_URL,
    headers: { ...(model.headers ?? {}), ...buildXaiProxyHeaders(model.id) },
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > AUTH_MAX_BYTES) throw new Error("xAI OAuth response exceeded the size limit");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("xAI OAuth response was not JSON");
  }
}

export async function startXaiDeviceLogin(fetcher: OAuthFetch = fetch): Promise<XaiDeviceStart> {
  const response = await fetcher(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-grok-client-version": CLIENT_VERSION,
      "x-grok-client-surface": "cli",
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE, referrer: "grok-build" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`xAI device-code request failed (${response.status})`);
  const payload = await readJson(response);
  const deviceCode = String(payload.device_code ?? "");
  const userCode = String(payload.user_code ?? "");
  const verificationUri = String(payload.verification_uri ?? "");
  if (!deviceCode || !userCode || !verificationUri) throw new Error("xAI device-code response was incomplete");
  const expiresIn = Number(payload.expires_in ?? 600);
  const sessionId = randomBytes(16).toString("hex");
  pending.set(sessionId, { deviceCode, expiresAt: Date.now() + Math.max(expiresIn, 60) * 1000 });
  const complete = payload.verification_uri_complete;
  return {
    sessionId,
    userCode,
    verificationUri,
    ...(typeof complete === "string" && complete ? { verificationUriComplete: complete } : {}),
    expiresIn,
    interval: Math.max(1, Number(payload.interval ?? 5)),
  };
}

export async function pollXaiDeviceLogin(
  sessionId: string,
  fetcher: OAuthFetch = fetch,
): Promise<XaiDevicePoll> {
  const session = pending.get(sessionId);
  if (!session) return { status: "expired" };
  if (Date.now() > session.expiresAt) {
    pending.delete(sessionId);
    return { status: "expired" };
  }
  const response = await fetcher(DEVICE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-grok-client-version": CLIENT_VERSION,
      "x-grok-client-surface": "cli",
    },
    body: new URLSearchParams({
      grant_type: DEVICE_GRANT_TYPE,
      device_code: session.deviceCode,
      client_id: CLIENT_ID,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) {
    const payload = await readJson(response);
    const access = String(payload.access_token ?? "");
    const refresh = String(payload.refresh_token ?? "");
    if (!access || !refresh) throw new Error("xAI device login did not return tokens");
    const expiresIn = Number(payload.expires_in ?? 3600);
    pending.delete(sessionId);
    return {
      status: "approved",
      credentials: {
        access,
        refresh,
        expires: Date.now() + expiresIn * 1000 - REFRESH_SKEW_MS,
        tokenEndpoint: DEVICE_TOKEN_URL,
      },
    };
  }
  const payload = await readJson(response).catch(() => ({}) as Record<string, unknown>);
  const error = String(payload.error ?? "");
  if (error === "authorization_pending") return { status: "pending" };
  if (error === "slow_down") return { status: "slow_down" };
  if (error === "access_denied") {
    pending.delete(sessionId);
    return { status: "denied" };
  }
  if (error === "expired_token") {
    pending.delete(sessionId);
    return { status: "expired" };
  }
  return { status: "unknown" };
}

export async function refreshXaiAccessToken(
  credentials: XaiOAuthCredentials,
  fetcher: OAuthFetch = fetch,
): Promise<XaiOAuthCredentials> {
  if (!credentials.refresh) throw new Error("Missing SuperGrok refresh token; sign in again");
  if (credentials.expires > Date.now()) return credentials;
  const response = await fetcher(credentials.tokenEndpoint || DEVICE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: credentials.refresh,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`xAI token refresh failed (${response.status})`);
  const payload = await readJson(response);
  const access = String(payload.access_token ?? "");
  if (!access) throw new Error("xAI token refresh did not return access_token");
  const expiresIn = Number(payload.expires_in ?? 3600);
  return {
    access,
    refresh: String(payload.refresh_token ?? credentials.refresh),
    expires: Date.now() + expiresIn * 1000 - REFRESH_SKEW_MS,
    tokenEndpoint: credentials.tokenEndpoint || DEVICE_TOKEN_URL,
  };
}

export function resetXaiOAuthForTests(): void {
  pending.clear();
}
