import { getModel } from "@earendil-works/pi-ai";
import type { Api, Model } from "@earendil-works/pi-ai";

const KNOWN_PROVIDERS = ["anthropic", "openai", "openrouter", "xai"] as const;

const CLONE_TEMPLATES: Readonly<Record<string, { template: string; name: string }>> = {
  "claude-fable-5": { template: "claude-opus-4-8", name: "Claude Fable 5" },
  "claude-opus-5": { template: "claude-opus-4-8", name: "Claude Opus 5" },
  "claude-sonnet-5": { template: "claude-sonnet-4-6", name: "Claude Sonnet 5" },
  "gpt-5.6-sol": { template: "gpt-5.5", name: "GPT-5.6 Sol" },
  "gpt-5.6-terra": { template: "gpt-5.5", name: "GPT-5.6 Terra" },
  "gpt-5.6-luna": { template: "gpt-5.5", name: "GPT-5.6 Luna" },
  "grok-4.6": { template: "grok-4.5", name: "Grok 4.6" },
  "grok-4.5": { template: "grok-4.5", name: "Grok 4.5" },
};

type PiModel = Model<Api>;

function builtinModel(id: string): PiModel | undefined {
  for (const provider of KNOWN_PROVIDERS) {
    const model = getModel(provider, id as Parameters<typeof getModel>[1]) as PiModel | undefined;
    if (model) return model;
  }
  return undefined;
}

export function getBaseModel(id: string, fallback?: { name: string; provider: string }): PiModel {
  const builtin = builtinModel(id);
  if (builtin) return builtin;
  const clone = CLONE_TEMPLATES[id];
  if (clone) {
    const template = builtinModel(clone.template);
    if (template) return cloneModel(template, id, clone.name);
  }
  if (fallback) {
    const template = getModel("openrouter", "openrouter/auto" as Parameters<typeof getModel>[1]) as PiModel | undefined;
    if (template) return { ...cloneModel(template, id, fallback.name), provider: fallback.provider };
  }
  if (fallback?.provider === "xai" || id.startsWith("grok-")) {
    return xaiFallbackModel(id, fallback?.name ?? clone?.name ?? id);
  }
  throw new Error(`Unsupported model: ${id}`);
}

function xaiFallbackModel(id: string, name: string): PiModel {
  return {
    id,
    name,
    api: "openai-completions",
    provider: "xai",
    baseUrl: "https://api.x.ai/v1",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 2, output: 6, cacheRead: 0.3, cacheWrite: 0 },
    contextWindow: 500_000,
    maxTokens: 128_000,
  } as PiModel;
}

function cloneModel(model: PiModel, id: string, name: string): PiModel {
  return { ...structuredClone(model), id, name };
}

const fastModeByScope = new Map<string, Set<string>>();
let lastFastModeIds = new Set<string>();

export function setFastModeModelIds(scopeKey: string | null, ids: readonly string[] | undefined): void {
  lastFastModeIds = new Set(ids ?? []);
  if (scopeKey !== null) fastModeByScope.set(scopeKey, lastFastModeIds);
}

export function modelSupportsFastMode(scopeKey: string | null, modelId: string | undefined): boolean {
  const ids = (scopeKey !== null ? fastModeByScope.get(scopeKey) : undefined) ?? lastFastModeIds;
  return !!modelId && ids.has(modelId);
}
