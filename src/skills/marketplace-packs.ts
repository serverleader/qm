import type { ScopeId } from "../types.ts";
import type { NewSkillPack, SkillPack, SkillPackStore } from "./skill-pack-store.ts";

export const LAST30DAYS_PACK_URL = "https://github.com/mvanhorn/last30days-skill.git";

export function isLast30daysPackUrl(url: string): boolean {
  const n = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
  return n === LAST30DAYS_PACK_URL.replace(/\.git$/i, "").toLowerCase();
}

export function last30daysPackInput(orgScopeId: ScopeId, createdBy = "system:marketplace"): NewSkillPack {
  return {
    kind: "git",
    url: LAST30DAYS_PACK_URL,
    ref: "main",
    syncMode: "tracked",
    trustTier: "third-party",
    targetScopeId: orgScopeId,
    subset: "all",
    createdBy,
  };
}

export async function ensureLast30daysSkillPack(opts: {
  packs: SkillPackStore;
  register: (input: NewSkillPack) => Promise<SkillPack>;
  importPack: (id: string, selected: "all" | string[], scopeIds: ScopeId[]) => Promise<unknown>;
  orgScopeId: ScopeId;
}): Promise<"imported" | "exists"> {
  const existing = (await opts.packs.list()).find((pack) => isLast30daysPackUrl(pack.url));
  if (existing?.lastImport?.status === "ok") return "exists";
  const pack = existing ?? (await opts.register(last30daysPackInput(opts.orgScopeId)));
  await opts.importPack(pack.id, "all", [opts.orgScopeId]);
  return existing ? "imported" : "imported";
}
