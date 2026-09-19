/**
 * KIT K1 · 客户端侧 kit-api 路径级导入边界机检（docs/KIT.md §4 / §9 K1；docs/MMO.md MF0；docs/MMO-PLAN.md MF0-B1）。
 *
 * 规则按**解析后的仓相对路径**判（⛔ 不按裸说明符；客户端只有相对导入，铁律 3）：
 *  - 插件客户端代码（`apps/client/src/plugins/<id>/**` + plugin.json 的 viewDirs / owners[].logicDir + gameplay 模式四件）
 *    落进 kit 命名空间的导入只允许 `apps/client/src/kits/<kit>/api/**` 与 `apps/client/src/shared/kits/<kit>/api/**`，
 *    且 `<kit>` ∈ plugin.json.requires.kits；⛔ kit 内部模块、⛔ 未声明的 kit、⛔ 别的插件目录；
 *  - kit 客户端代码（`apps/client/src/kits/<id>/**` + kit.json 登记的 viewDirs / owners / 模式四件）只能落在本 kit
 *    目录、本 kit 的 shared 镜像（`apps/client/src/shared/kits/<id>/**`）与框架；⛔ 别的 kit（v0 无 kit-on-kit）、⛔ 任何插件目录；
 *  - 宿主自有包（plugin.json 无 version 的 builtin）与框架目录不在扫描面：宿主 → kit 的消费边界是 PLUGIN-REGISTRY §4.3
 *    plugin-api 门面那道闸，⛔ 不在 K1 里混判。
 * 服务端 / shared 侧的同一道闸在 apps/server/test/kit-import-boundary.test.ts。
 *
 * 变异验证（改哪一行 → 哪条用例转红）：
 *  - 删 judgeClientImport 里「`/api/` 前缀」判断 → 夹具用例「kit 内部模块」转红；
 *  - 删「requires.kits 包含」判断 → 夹具用例「未声明的 kit」转红；
 *  - 删 kit 分支的 `kitId === owner.id` → 夹具用例「kit-on-kit」转红。
 * 随 npm run test:client 一起跑（root package.json 的 glob 自动纳入本文件）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLIENT_SRC = "apps/client/src";
const KITS_NS = `${CLIENT_SRC}/kits/`;
const SHARED_KITS_NS = `${CLIENT_SRC}/shared/kits/`;
const PLUGINS_NS = `${CLIENT_SRC}/plugins/`;

export interface ClientPackage {
    readonly cls: "plugin" | "kit";
    readonly id: string;
    /** 插件声明依赖的 kit id（plugin.json.requires.kits 的键）；kit 恒空（v0 无 kit-on-kit）。 */
    readonly requiresKits: readonly string[];
    /** 该包拥有的客户端目录 / 文件（仓相对 posix 路径）。 */
    readonly dirs: readonly string[];
}

export interface BoundaryViolation {
    readonly file: string;
    readonly specifier: string;
    readonly reason: string;
}

export interface BoundaryScan {
    readonly scanned: number;
    readonly violations: readonly BoundaryViolation[];
}

function toPosix(p: string): string {
    return p.split(sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readJson(file: string): Record<string, unknown> | null {
    if (!existsSync(file)) return null;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isRecord(parsed) ? parsed : null;
}

/** 玩法模式的客户端四件里会被误当作框架的两处：gameplay/modes/<id>/ 与 net/rooms/<Constant>Room.ts。 */
function modeClientPaths(modeId: string, constantName: string): string[] {
    return [`${CLIENT_SRC}/gameplay/modes/${modeId}`, `${CLIENT_SRC}/net/rooms/${constantName}Room.ts`];
}

function registrationDirs(manifest: Record<string, unknown>): string[] {
    const dirs = stringArray(manifest.viewDirs);
    for (const owner of Array.isArray(manifest.owners) ? manifest.owners : []) {
        if (isRecord(owner) && typeof owner.logicDir === "string") dirs.push(owner.logicDir);
    }
    return dirs;
}

/** 从 apps/plugins/<id>/plugin.json 与 apps/kits/<id>/kit.json 推导每个包拥有的客户端目录（与 tools/plugin/ownership.ts 的推导集同口径的子集）。 */
export function loadClientPackages(root: string): ClientPackage[] {
    const packages: ClientPackage[] = [];
    const pluginsDir = join(root, "apps/plugins");
    for (const id of existsSync(pluginsDir) ? readdirSync(pluginsDir).sort() : []) {
        const manifest = readJson(join(pluginsDir, id, "plugin.json"));
        if (!manifest || typeof manifest.id !== "string") continue;
        // 宿主自有插件（无 version，如 builtin）拥有 apps/client/src/view 这类框架目录：宿主消费 kit 走 plugin-api 门面那道闸，不在此判。
        if (typeof manifest.version !== "string") continue;
        const requires = isRecord(manifest.requires) && isRecord(manifest.requires.kits) ? Object.keys(manifest.requires.kits) : [];
        const dirs = [`${PLUGINS_NS}${manifest.id}`, ...registrationDirs(manifest)];
        const gameplay = readJson(join(pluginsDir, id, "gameplay/manifest.json"));
        if (gameplay && typeof gameplay.id === "string" && typeof gameplay.constantName === "string") {
            dirs.push(...modeClientPaths(gameplay.id, gameplay.constantName));
        }
        packages.push({ cls: "plugin", id: manifest.id, requiresKits: requires.sort(), dirs: [...new Set(dirs)] });
    }
    const kitsDir = join(root, "apps/kits");
    for (const id of existsSync(kitsDir) ? readdirSync(kitsDir).sort() : []) {
        const manifest = readJson(join(kitsDir, id, "kit.json"));
        if (!manifest || typeof manifest.id !== "string") continue;
        const dirs = [`${KITS_NS}${manifest.id}`, ...registrationDirs(manifest)];
        for (const mode of Array.isArray(manifest.modes) ? manifest.modes : []) {
            if (isRecord(mode) && typeof mode.id === "string" && typeof mode.constantName === "string") {
                dirs.push(...modeClientPaths(mode.id, mode.constantName));
            }
        }
        packages.push({ cls: "kit", id: manifest.id, requiresKits: [], dirs: [...new Set(dirs)] });
    }
    return packages;
}

/** import / export … from "x"、import "x"、动态 import("x") 的说明符（与服务端测试同一正则）。 */
export function importSpecifiers(source: string): string[] {
    const out: string[] = [];
    for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gu)) out.push(m[1]);
    for (const m of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/gu)) out.push(m[1]);
    for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) out.push(m[1]);
    return out;
}

/** 相对说明符 → 仓相对 posix 路径（无扩展名）；非相对说明符（cc / 包名）返回 null，不在本闸范围。 */
export function resolveRelative(root: string, file: string, specifier: string): string | null {
    if (!specifier.startsWith(".")) return null;
    return toPosix(relative(root, resolve(dirname(file), specifier)));
}

/** 纯函数判定：owner 的文件 import 了解析后为 target 的模块。返回 null = 放行，否则是拒绝理由。 */
export function judgeClientImport(owner: ClientPackage, target: string): string | null {
    for (const ns of [KITS_NS, SHARED_KITS_NS]) {
        if (!target.startsWith(ns)) continue;
        const kitId = target.slice(ns.length).split("/")[0] ?? "";
        if (owner.cls === "kit") {
            return kitId === owner.id ? null : `kit "${owner.id}" 不得 import 别的 kit "${kitId}"（v0 无 kit-on-kit）：${target}`;
        }
        if (!owner.requiresKits.includes(kitId)) {
            return `插件 "${owner.id}" import 了未在 plugin.json.requires.kits 声明的 kit "${kitId}"：${target}`;
        }
        if (!target.startsWith(`${ns}${kitId}/api/`)) {
            return `插件 "${owner.id}" 只能 import kit "${kitId}" 的 api 面（${ns}${kitId}/api/**），⛔ kit 内部模块：${target}`;
        }
        return null;
    }
    if (target.startsWith(PLUGINS_NS)) {
        const pluginId = target.slice(PLUGINS_NS.length).split("/")[0] ?? "";
        if (owner.cls === "kit") return `kit "${owner.id}" 不得依赖插件：${target}`;
        if (pluginId !== owner.id) return `插件 "${owner.id}" 不得 import 别的插件 "${pluginId}"：${target}`;
    }
    return null;
}

function walkTs(dir: string): string[] {
    if (!existsSync(dir)) return [];
    if (statSync(dir).isFile()) return dir.endsWith(".ts") ? [dir] : [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walkTs(join(dir, entry.name))
            : entry.name.endsWith(".ts") && !entry.name.endsWith(".generated.ts") ? [join(dir, entry.name)] : []); // 生成物由 writer 拥有（MF9 contributions.generated.ts），⛔ 不进扫描面
}

/** 扫描整棵检出：文件按最长匹配的登记目录归属到包，再逐条 import 过 judgeClientImport。 */
export function scanClientKitBoundary(root: string, packages: readonly ClientPackage[] = loadClientPackages(root)): BoundaryScan {
    const ownerOf = new Map<string, { owner: ClientPackage; depth: number }>();
    for (const owner of packages) {
        for (const dir of owner.dirs) {
            for (const file of walkTs(join(root, dir))) {
                const current = ownerOf.get(file);
                if (!current || current.depth < dir.length) ownerOf.set(file, { owner, depth: dir.length });
            }
        }
    }
    const violations: BoundaryViolation[] = [];
    for (const [file, { owner }] of [...ownerOf.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const source = readFileSync(file, "utf8");
        for (const specifier of importSpecifiers(source)) {
            const target = resolveRelative(root, file, specifier);
            if (target === null) continue;
            const reason = judgeClientImport(owner, target);
            if (reason !== null) violations.push({ file: toPosix(relative(root, file)), specifier, reason });
        }
    }
    return { scanned: ownerOf.size, violations };
}

test("client kit-api 边界：仓内插件 / kit 客户端代码零越界（样本 arenaShop → arena 只经 api 面）", () => {
    const packages = loadClientPackages(REPO_ROOT);
    const arenaShop = packages.find((pkg) => pkg.id === "arenaShop");
    assert.ok(arenaShop && arenaShop.requiresKits.includes("arena"), "样本插件 arenaShop 在树上且声明了 requires.kits.arena（否则本测试空转）");
    assert.ok(packages.some((pkg) => pkg.cls === "kit" && pkg.id === "arena"), "样本 kit arena 在树上");
    assert.ok(!packages.some((pkg) => pkg.id === "builtin"), "宿主自有 builtin 不进扫描面");
    const scan = scanClientKitBoundary(REPO_ROOT, packages);
    assert.ok(scan.scanned >= 10, `扫描到的插件 / kit 客户端文件过少（${scan.scanned}）——推导目录可能错了`);
    assert.deepEqual(scan.violations, []);
});

test("judgeClientImport 自测：api 面 / 自身 / 框架放行，内部模块 / 未声明 kit / 他插件 / kit-on-kit / kit→插件都拒", () => {
    const shop: ClientPackage = { cls: "plugin", id: "arenaShop", requiresKits: ["arena"], dirs: [] };
    const arena: ClientPackage = { cls: "kit", id: "arena", requiresKits: [], dirs: [] };
    assert.equal(judgeClientImport(shop, "apps/client/src/kits/arena/api/board/index"), null);
    assert.equal(judgeClientImport(shop, "apps/client/src/shared/kits/arena/api/board/index"), null);
    assert.equal(judgeClientImport(shop, "apps/client/src/plugins/arenaShop/logic/x"), null);
    assert.equal(judgeClientImport(shop, "apps/client/src/shared/protocol/lobbyRpc/domains/arenaShop"), null, "shared 非 kit 路径不在本闸范围");
    assert.equal(judgeClientImport(shop, "apps/client/src/app/PluginHost"), null, "框架门面不在本闸范围");
    assert.match(judgeClientImport(shop, "apps/client/src/kits/arena/logic/ArenaBoardLogic") ?? "", /kit 内部模块/u);
    assert.match(judgeClientImport(shop, "apps/client/src/kits/arena/index") ?? "", /kit 内部模块/u, "kit 入口也是内部模块");
    assert.match(judgeClientImport(shop, "apps/client/src/shared/kits/arena/internal") ?? "", /kit 内部模块/u);
    assert.match(judgeClientImport(shop, "apps/client/src/kits/slg/api/worldmap/index") ?? "", /未在 plugin.json.requires.kits 声明/u);
    assert.match(judgeClientImport(shop, "apps/client/src/plugins/redeem/index") ?? "", /不得 import 别的插件/u);
    assert.equal(judgeClientImport(arena, "apps/client/src/kits/arena/logic/x"), null, "kit 自身内部随便用");
    assert.equal(judgeClientImport(arena, "apps/client/src/shared/kits/arena/api/board/index"), null);
    assert.match(judgeClientImport(arena, "apps/client/src/kits/slg/api/worldmap/index") ?? "", /kit-on-kit/u);
    assert.match(judgeClientImport(arena, "apps/client/src/plugins/arenaShop/index") ?? "", /不得依赖插件/u);
    assert.equal(resolveRelative("/r", "/r/apps/client/src/plugins/x/view/A.ts", "../../../kits/arena/api/board/index"), "apps/client/src/kits/arena/api/board/index");
    assert.equal(resolveRelative("/r", "/r/apps/client/src/plugins/x/index.ts", "cc"), null);
});

test("夹具反例：临时检出里越界的插件 / kit 文件被逐条点名（扫描器 + 判定端到端）", () => {
    const root = mkdtempSync(join(tmpdir(), "kit-import-boundary-"));
    try {
        const write = (relativePath: string, text: string): void => {
            const file = join(root, relativePath);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, text);
        };
        write("apps/plugins/badplug/plugin.json", JSON.stringify({ schemaVersion: 2, id: "badplug", version: "1.0.0", requires: { kits: { arena: { board: 1 } } }, viewDirs: ["apps/client/src/view/rooms/badplug"] }));
        write("apps/plugins/hostish/plugin.json", JSON.stringify({ schemaVersion: 2, id: "hostish", viewDirs: ["apps/client/src/view"] }));
        write("apps/kits/kfix/kit.json", JSON.stringify({ schemaVersion: 1, id: "kfix", modes: [{ id: "kfixDuel", constantName: "KfixDuel" }] }));
        write("apps/client/src/plugins/badplug/a.ts", 'import { x } from "../../kits/arena/logic/ArenaBoardLogic";\nexport const a = x;\n');
        write("apps/client/src/plugins/badplug/b.ts", 'import { y } from "../../kits/slg/api/worldmap/index";\nexport const b = y;\n');
        write("apps/client/src/plugins/badplug/c.ts", 'import type { Z } from "../../shared/kits/arena/internal";\nexport type C = Z;\n');
        write("apps/client/src/plugins/badplug/d.ts", 'export { d } from "../redeem/index";\n');
        write("apps/client/src/plugins/badplug/ok.ts", 'import { fetchArenaBoard } from "../../kits/arena/api/board/index";\nimport { s } from "../../shared/kits/arena/api/board/index";\nimport { h } from "../../app/PluginHost";\nexport const ok = [fetchArenaBoard, s, h];\n');
        write("apps/client/src/view/rooms/badplug/BadView.ts", 'const m = await import("../../../kits/arena/index");\nexport default m;\n');
        write("apps/client/src/view/HomeView.ts", 'import { u } from "../kits/uniflex/api/cocos/index";\nexport const home = u;\n');
        write("apps/client/src/kits/kfix/logic/x.ts", 'import { q } from "../../arena/api/board/index";\nimport { p } from "../../../plugins/badplug/ok";\nimport { own } from "../../../shared/kits/kfix/api/board/index";\nexport const x = [q, p, own];\n');
        write("apps/client/src/gameplay/modes/kfixDuel/index.ts", 'import { r } from "../../../kits/kfix/internal";\nexport const mode = r;\n');
        write("apps/client/src/net/rooms/KfixDuelRoom.ts", 'import { s } from "../../kits/slg/internal";\nexport const room = s;\n');
        // MF9 生成物：kits/<id>/contributions.generated.ts 由 codegen:plugins 拥有并静态 import 插件模块——⛔ 不进扫描面
        write("apps/client/src/kits/kfix/contributions.generated.ts", 'import { ok } from "../../plugins/badplug/ok";\nexport const KIT_CONTRIBUTIONS = { content: [ok] } as const;\n');

        const packages = loadClientPackages(root);
        assert.deepEqual(packages.map((pkg) => `${pkg.cls}:${pkg.id}`), ["plugin:badplug", "kit:kfix"], "无 version 的 hostish 是宿主自有包，不进扫描面");
        const scan = scanClientKitBoundary(root, packages);
        assert.equal(scan.scanned, 9, "六个插件文件（含 viewDirs）+ 三个 kit 文件（含模式四件）都归到了包；宿主 HomeView 不算");
        const seen = scan.violations.map((violation) => `${violation.file} :: ${violation.reason.replace(/：.*$/u, "")}`);
        assert.deepEqual(seen, [
            "apps/client/src/kits/kfix/logic/x.ts :: kit \"kfix\" 不得 import 别的 kit \"arena\"（v0 无 kit-on-kit）",
            "apps/client/src/kits/kfix/logic/x.ts :: kit \"kfix\" 不得依赖插件",
            "apps/client/src/net/rooms/KfixDuelRoom.ts :: kit \"kfix\" 不得 import 别的 kit \"slg\"（v0 无 kit-on-kit）",
            "apps/client/src/plugins/badplug/a.ts :: 插件 \"badplug\" 只能 import kit \"arena\" 的 api 面（apps/client/src/kits/arena/api/**），⛔ kit 内部模块",
            "apps/client/src/plugins/badplug/b.ts :: 插件 \"badplug\" import 了未在 plugin.json.requires.kits 声明的 kit \"slg\"",
            "apps/client/src/plugins/badplug/c.ts :: 插件 \"badplug\" 只能 import kit \"arena\" 的 api 面（apps/client/src/shared/kits/arena/api/**），⛔ kit 内部模块",
            "apps/client/src/plugins/badplug/d.ts :: 插件 \"badplug\" 不得 import 别的插件 \"redeem\"",
            "apps/client/src/view/rooms/badplug/BadView.ts :: 插件 \"badplug\" 只能 import kit \"arena\" 的 api 面（apps/client/src/kits/arena/api/**），⛔ kit 内部模块",
        ]);
        assert.ok(!scan.violations.some((violation) => violation.file.endsWith("badplug/ok.ts")), "合法导入零误伤");
        assert.ok(!scan.violations.some((violation) => violation.file.includes("kfixDuel/index.ts")), "kit 模式四件 import 本 kit 内部模块是合法的");
        assert.ok(!scan.violations.some((violation) => violation.file.endsWith("HomeView.ts")), "宿主自有目录不进扫描面");
        assert.ok(!scan.violations.some((violation) => violation.file.endsWith(".generated.ts")), "生成物不进客户端扫描面（MF9 contributions.generated.ts）");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
