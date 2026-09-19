/**
 * MF9-B1（docs/MMO.md MF9 / docs/MMO-PLAN.md MF9-B1）：kit.json `contributions` / `fragments`、plugin.json `contributes`、
 * menu launch `payload` / `profile` 的解析规则与锁抬头 / 身份摘要单测（纯解析，⛔ 不读工作树；codegen 收录与三道闸在 B2）。
 * 变异验证：pluginManifestSchema.parseContributes 删「contributes ⇒ requires.kits」耦合 → 「贡献未声明依赖被拒」转红；
 * parseContributions 删「module 恰好一端」→ 转红；lock.parseInstalledLock 删「插件锁不该有 contributions」→ 「跨类别拒」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_REQUIRES, parseKitRegistration, parsePluginRegistration, schemaDigestOf, validateAgainstSchema,
} from "../tools/plugin-codegen/pluginManifestSchema";
import { parseInstalledLock, renderInstalledLock, type InstalledLock } from "../tools/plugin/lock";
import { identityDifferences, identitySummary } from "../tools/plugin/manifest";

const KIT = { schemaVersion: 1, id: "kfix", version: "1.0.0", api: { default: { version: 1, minSupported: 1 } } };
const CONTENT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title"],
  properties: { title: { type: "string", pattern: "^.{1,32}$" }, weight: { type: "integer", minimum: 0 } },
};
const kit = (extra: Record<string, unknown>) => parseKitRegistration({ ...KIT, ...extra }, "kit.json");
const plugin = (extra: Record<string, unknown>) => parsePluginRegistration({ schemaVersion: 2, id: "kfixShop", version: "1.0.0", ...extra }, "plugin.json");

test("kit.json contributions：data 带 schema（digest 按规范化 JSON）、module 带 export 恰好一端；fragments 唯一；缺省空", () => {
  const reg = kit({
    contributions: {
      content: { kind: "data", ends: ["shared", "client"], schema: CONTENT_SCHEMA },
      hook: { kind: "module", ends: ["server"], export: "hook" },
    },
    fragments: ["arena", "guild"],
  });
  assert.deepEqual(Object.keys(reg.contributions), ["content", "hook"]);
  const content = reg.contributions.content;
  assert.equal(content?.kind, "data");
  if (content?.kind === "data") {
    assert.deepEqual(content.ends, ["shared", "client"]);
    assert.equal(content.schemaDigest, schemaDigestOf(CONTENT_SCHEMA));
    // 键序无关：同一份 schema 换键序 digest 不变
    assert.equal(content.schemaDigest, schemaDigestOf({ required: ["title"], properties: CONTENT_SCHEMA.properties, additionalProperties: false, type: "object" }));
    assert.notEqual(content.schemaDigest, schemaDigestOf({ ...CONTENT_SCHEMA, required: [] }));
  }
  assert.deepEqual(reg.contributions.hook, { kind: "module", ends: ["server"], export: "hook" });
  assert.deepEqual(reg.fragments, ["arena", "guild"]);
  assert.deepEqual([kit({}).contributions, kit({}).fragments], [{}, []]);
});

test("kit.json contributions 拒绝矩阵：module 无 export / 带 schema / 两端；data 无 schema / 带 export / schema 用未支持关键字；ends 空或重复或非法；fragments 重复", () => {
  const bad = (contributions: unknown, re: RegExp): void => { assert.throws(() => kit({ contributions }), re); };
  bad({ hook: { kind: "module", ends: ["server"] } }, /必须声明 export/u);
  bad({ hook: { kind: "module", ends: ["server"], export: "hook", schema: {} } }, /不得声明 schema/u);
  bad({ hook: { kind: "module", ends: ["server", "client"], export: "hook" } }, /恰好一端/u);
  bad({ content: { kind: "data", ends: ["shared"] } }, /必须声明 schema/u);
  bad({ content: { kind: "data", ends: ["shared"], schema: CONTENT_SCHEMA, export: "x" } }, /不得声明 export/u);
  bad({ content: { kind: "data", ends: ["shared"], schema: { oneOf: [] } } }, /unsupported keyword "oneOf"/u);
  bad({ content: { kind: "data", ends: [], schema: CONTENT_SCHEMA } }, /至少声明一端/u);
  bad({ content: { kind: "data", ends: ["shared", "shared"], schema: CONTENT_SCHEMA } }, /端 重复/u);
  bad({ content: { kind: "data", ends: ["mobile"], schema: CONTENT_SCHEMA } }, /./u);
  bad({ Content: { kind: "data", ends: ["shared"], schema: CONTENT_SCHEMA } }, /./u);
  assert.throws(() => kit({ fragments: ["a", "a"] }), /fragment 重复/u);
  assert.throws(() => kit({ fragments: ["Arena"] }), /./u);
});

test("plugin.json contributes：被贡献的 kit 必须同时在 requires.kits 声明（贡献 = 依赖）；每 kit 至少一条；路径形态；缺省空", () => {
  const files = { content: "apps/plugins/kfixShop/contributions/kfix/content.json", hook: "apps/server/src/core/kfixShop/hook.ts" };
  const reg = plugin({ requires: { kits: { kfix: { default: 1 } } }, contributes: { kfix: files } });
  assert.deepEqual(reg.contributes, { kfix: files });
  assert.deepEqual(plugin({}).contributes, {});
  assert.throws(() => plugin({ contributes: { kfix: { content: files.content } } }), /向 kit "kfix" 贡献必须同时在 requires\.kits 声明/u);
  assert.throws(() => plugin({ requires: { kits: { kfix: { default: 1 } } }, contributes: { kfix: {} } }), /至少填充一个贡献点/u);
  assert.throws(() => plugin({ requires: { kits: { kfix: { default: 1 } } }, contributes: { kfix: { content: "docs/x.json" } } }), /./u);
  assert.throws(() => plugin({ requires: { kits: { kfix: { default: 1 } } }, contributes: { kfix: { content: "apps/plugins/kfixShop/c.yaml" } } }), /./u);
});

test("menu launch：gameplay 可带 payload / profile；route 不得带；payload 必须是对象；profile 形态", () => {
  const menu = (launch: unknown) => plugin({ menu: [{ entryId: "e", label: "E", labelKey: "menu.e", launch }] }).menu[0]?.launch;
  assert.deepEqual(menu({ kind: "gameplay", gameplayId: "snake", payload: { arena: "north", size: 3 }, profile: "private" }),
    { kind: "gameplay", gameplayId: "snake", payload: { arena: "north", size: 3 }, profile: "private" });
  assert.deepEqual(menu({ kind: "gameplay", gameplayId: "snake" }), { kind: "gameplay", gameplayId: "snake" });
  assert.throws(() => menu({ kind: "route", routeId: "r", payload: {} }), /不得声明 payload \/ profile/u);
  assert.throws(() => menu({ kind: "route", routeId: "r", profile: "p" }), /不得声明 payload \/ profile/u);
  assert.throws(() => menu({ kind: "gameplay", gameplayId: "snake", payload: [1] }), /./u);
  assert.throws(() => menu({ kind: "gameplay", gameplayId: "snake", profile: "bad profile" }), /./u);
});

const baseLock = (manifest: InstalledLock["manifest"]): InstalledLock => ({ manifest, entries: [{ path: "apps/kits/kfix/kit.json", sha256: "a".repeat(64) }] });

test("锁抬头：kit 带 contributions（data 只带 digest）/ fragments、插件带 contributes 往返一致；空值不写出；跨类别与坏 digest 拒", () => {
  const digest = schemaDigestOf(CONTENT_SCHEMA);
  const kitLock = baseLock({
    class: "kit", id: "kfix", version: "1.0.0", kinds: ["server"], constantName: null, modes: [], domains: [], fguiPackages: [],
    api: { default: { version: 1, minSupported: 1 } }, requires: EMPTY_REQUIRES, workers: [],
    contributions: { content: { kind: "data", ends: ["shared", "client"], schemaDigest: digest }, hook: { kind: "module", ends: ["server"], export: "hook" } },
    fragments: ["arena"], contributes: {},
  });
  const text = renderInstalledLock(kitLock);
  assert.match(text, /"contributions":\{"content":\{"kind":"data","ends":\["shared","client"\],"schemaDigest":"[0-9a-f]{64}"\},"hook":\{"kind":"module","ends":\["server"\],"export":"hook"\}\}/u);
  assert.match(text, /"fragments":\["arena"\]/u);
  assert.ok(!text.includes("\"contributes\""), "kit 锁不写 contributes");
  const back = parseInstalledLock(text, "kfix.lock");
  assert.deepEqual(back.manifest.contributions, kitLock.manifest.contributions);
  assert.deepEqual(back.manifest.fragments, ["arena"]);
  assert.deepEqual(back.manifest.contributes, {});

  const pluginLock = baseLock({
    class: "plugin", id: "kfixShop", version: "1.0.0", kinds: ["client"], constantName: null, modes: [], domains: [], fguiPackages: [],
    api: {}, requires: { pluginApiVersion: null, kits: { kfix: { default: 1 } } }, workers: [], contributions: {}, fragments: [],
    contributes: { kfix: { content: "apps/plugins/kfixShop/contributions/kfix/content.json" } },
  });
  const ptext = renderInstalledLock(pluginLock);
  assert.match(ptext, /"contributes":\{"kfix":\{"content":"apps\/plugins\/kfixShop\/contributions\/kfix\/content\.json"\}\}/u);
  assert.ok(!ptext.includes("\"contributions\"") && !ptext.includes("\"fragments\""), "插件锁不写 contributions / fragments");
  const pback = parseInstalledLock(ptext, "kfixShop.lock");
  assert.deepEqual(pback.manifest.contributes, pluginLock.manifest.contributes);
  assert.deepEqual([pback.manifest.contributions, pback.manifest.fragments], [{}, []]);

  assert.throws(() => parseInstalledLock(ptext.replace("\"contributes\"", "\"fragments\":[\"x\"],\"contributes\""), "x.lock"), /插件锁不该有 contributions \/ fragments/u);
  assert.throws(() => parseInstalledLock(ptext.replace("\"contributes\"", "\"contributions\":{\"c\":{\"kind\":\"module\",\"ends\":[\"server\"],\"export\":\"c\"}},\"contributes\""), "x.lock"), /插件锁不该有 contributions/u);
  assert.throws(() => parseInstalledLock(text.replace("\"fragments\"", "\"contributes\":{\"a\":{\"b\":\"apps/plugins/a/b.json\"}},\"fragments\""), "x.lock"), /kit 锁不该有 contributes/u);
  assert.throws(() => parseInstalledLock(text.replace(digest, "zz"), "x.lock"), /contributions\.content 非法/u);
  assert.throws(() => parseInstalledLock(text.replace("\"ends\":[\"server\"]", "\"ends\":[\"server\",\"client\"]"), "x.lock"), /contributions\.hook 非法/u);
  assert.throws(() => parseInstalledLock(ptext.replace("content.json", "content.yaml"), "x.lock"), /contributes\.kfix\.content 非法/u);
});

test("身份摘要：schema 变化 ⇒ digest 变化 ⇒ 差异点名 contributions；fragments / contributes 同进摘要；缺省为 -", () => {
  const a = {
    class: "kit" as const, kinds: ["server" as const], constantName: null, modes: [], domains: [], fguiPackages: [],
    contributions: { content: { kind: "data" as const, ends: ["shared" as const], schemaDigest: schemaDigestOf(CONTENT_SCHEMA) } },
    fragments: ["arena"],
  };
  const b = { ...a, contributions: { content: { ...a.contributions.content, schemaDigest: schemaDigestOf({ ...CONTENT_SCHEMA, required: [] }) } } };
  assert.deepEqual(identityDifferences(a, a), []);
  assert.match(identityDifferences(a, b).join("\n"), /^contributions: content:data:shared:[0-9a-f]{64} → content:data:shared:[0-9a-f]{64}$/u);
  assert.deepEqual(identityDifferences(a, { ...a, fragments: [] }), ["fragments: arena → -"]);
  const p = { class: "plugin" as const, kinds: ["client" as const], constantName: null, modes: [], domains: [], fguiPackages: [], contributes: { kfix: { content: "apps/plugins/x/c.json" } } };
  assert.equal(identitySummary(p).contributes, "kfix/content=apps/plugins/x/c.json");
  assert.deepEqual([identitySummary(p).contributions, identitySummary(p).fragments], ["-", "-"]);
});

test("validateAgainstSchema：kit 的 data schema 校验插件 JSON（exact keys / required / pattern / minimum）", () => {
  validateAgainstSchema(CONTENT_SCHEMA, { title: "hi", weight: 2 }, "content.json");
  assert.throws(() => validateAgainstSchema(CONTENT_SCHEMA, { title: "hi", extra: 1 }, "content.json"), /content\.json/u);
  assert.throws(() => validateAgainstSchema(CONTENT_SCHEMA, { weight: 2 }, "content.json"), /content\.json/u);
  assert.throws(() => validateAgainstSchema(CONTENT_SCHEMA, { title: "hi", weight: -1 }, "content.json"), /content\.json/u);
  assert.throws(() => validateAgainstSchema(CONTENT_SCHEMA, { title: "" }, "content.json"), /content\.json/u);
});
