import { test } from "node:test";
import assert from "node:assert/strict";
import { createSkillPackStore } from "../src/skills/skill-pack-store.ts";
import {
  ensureLast30daysSkillPack,
  isLast30daysPackUrl,
  LAST30DAYS_PACK_URL,
  last30daysPackInput,
} from "../src/skills/marketplace-packs.ts";
import { scopeId } from "../src/types.ts";

test("last30days pack url matches github clone URLs with or without .git", () => {
  assert.equal(isLast30daysPackUrl(LAST30DAYS_PACK_URL), true);
  assert.equal(isLast30daysPackUrl("https://github.com/mvanhorn/last30days-skill"), true);
  assert.equal(isLast30daysPackUrl("https://github.com/other/last30days-skill.git"), false);
});

test("ensureLast30daysSkillPack registers and imports once", async () => {
  const packs = createSkillPackStore();
  const org = scopeId("org", "acme");
  let registers = 0;
  let imports = 0;
  const first = await ensureLast30daysSkillPack({
    packs,
    register: async (input) => {
      registers++;
      assert.equal(input.url, LAST30DAYS_PACK_URL);
      assert.equal(input.syncMode, "tracked");
      return packs.create(input);
    },
    importPack: async (id) => {
      imports++;
      await packs.recordImport(id, { at: 1, commit: "abc", status: "ok" });
    },
    orgScopeId: org,
  });
  assert.equal(first, "imported");
  assert.equal(registers, 1);
  assert.equal(imports, 1);

  const second = await ensureLast30daysSkillPack({
    packs,
    register: async (input) => packs.create(input),
    importPack: async () => {
      imports++;
    },
    orgScopeId: org,
  });
  assert.equal(second, "exists");
  assert.equal(registers, 1);
  assert.equal(imports, 1);
});

test("last30daysPackInput targets the org and tracks main", () => {
  const input = last30daysPackInput(scopeId("org", "acme"));
  assert.equal(input.ref, "main");
  assert.equal(input.subset, "all");
  assert.equal(input.trustTier, "third-party");
});
