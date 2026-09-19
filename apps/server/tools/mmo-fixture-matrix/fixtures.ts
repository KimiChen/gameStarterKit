/**
 * MMO「框架侧完成」夹具矩阵的**物化器**（MMO MF11-B4；docs/MMO.md §5.5 夹具清单 / §10 退出条件、docs/MMO-PLAN.md MF11-B4）：
 * 把三份夹具在一次性检出（`scripts/lib/fixture-checkout.mjs`）里物化成**磁盘上的真实 kit / 插件**——
 *  - `kitfix`（kit）：世界形态玩法 `kitfixWorld`（= 入库的框架夹具 worldFixture 原样改名重挂到 kit 下：manifest / state.json / wire / mode /
 *    向量 sidecar 全部由 `apps/shared/schema/gameplays/worldFixture/` 与 `test/fixtures/worldFixtureMode.ts` 派生，⛔ 手抄第二份）+
 *    检查点 / 世界事件两表（`test/fixtures/kitfixWorld.ts` 的 SQL）+ 检查点端口 + grant worker + 贡献点 `grants` + api 面 `default`；
 *  - `kitfixContent`（插件）：建在 kitfix 上的纯内容插件——`requires.kits.kitfix.default` + `contributes.kitfix.grants`（data 贡献）+ 空客户端 module；
 *  - `worldFixture`：已在库（wireExposed:false 框架夹具），矩阵只证明它与上面两份并存时全部 check 仍绿。
 * 派生规则（顺序敏感）：`WORLD_FIXTURE` → `KITFIX_WORLD`、`WorldFixture` → `KitfixWorld`、`worldFixture` → `kitfixWorld`；mode 文件另做四处锚点编辑
 * （session → userId 映射，durable 事件载荷带 userId / kind，worker 入账不需要回查 persona 表）与登记函数追加；锚点缺失即抛（worldFixture 变了要同步改这里）。
 * ⛔ 本文件不写仓库工作树：只往调用方给的临时根写；⛔ 不进 verify:core（矩阵由 `npm run verify:mmo-fixture-matrix` 单独跑）。
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const KITFIX_ID = "kitfix";
export const KITFIX_CONTENT_ID = "kitfixContent";
export const KITFIX_WORLD_MODE_ID = "kitfixWorld";
export const KITFIX_WORLD_CONSTANT = "KitfixWorld";

/** 夹具落点根（物化 / 打包后清除 / 分类用）。 */
export const FIXTURE_DIRS: readonly string[] = [
  `apps/kits/${KITFIX_ID}`,
  `apps/plugins/${KITFIX_CONTENT_ID}`,
  `apps/server/src/kits/${KITFIX_ID}`,
  `apps/server/src/rooms/modes/${KITFIX_WORLD_MODE_ID}`,
  `apps/shared/src/gameplays/${KITFIX_WORLD_MODE_ID}`,
  `apps/client/src/gameplay/modes/${KITFIX_WORLD_MODE_ID}`,
  `apps/client/src/plugins/${KITFIX_CONTENT_ID}`,
];
export const FIXTURE_FILES_OUTSIDE_DIRS: readonly string[] = [
  `apps/server/test/wire-vectors/${KITFIX_WORLD_MODE_ID}.ts`,
];

const KITFIX_WORLD_SQL = `-- kitfix（MMO MF11-B4 夹具 kit）：分线 / persona 检查点信封表 + 框架固定列集的世界事件表（role:"world-event"）。
CREATE TABLE k_kitfix_checkpoint (
  server_id SMALLINT UNSIGNED NOT NULL,
  scope     VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  key_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rev       BIGINT UNSIGNED NOT NULL,
  envelope  JSON NOT NULL,
  saved_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, scope, key_id, rev)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE k_kitfix_world_event (
  server_id      SMALLINT UNSIGNED NOT NULL,
  event_id       VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  instance_id    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  seq            BIGINT UNSIGNED NOT NULL,
  kind           VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload        JSON NOT NULL,
  status         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  checkpoint_rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (server_id, event_id),
  UNIQUE KEY uk_kitfix_world_event_seq (server_id, instance_id, seq),
  KEY idx_kitfix_world_event_status (server_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;

const KIT_JSON = {
  schemaVersion: 1,
  id: KITFIX_ID,
  version: "1.0.0",
  description: "MMO 框架侧完成矩阵夹具 kit（MF11-B4）：世界形态玩法 kitfixWorld + 检查点 / 世界事件两表 + grant worker + 贡献点 grants；⛔ 不进生产",
  api: { default: { version: 1, minSupported: 1 } },
  domains: [],
  modes: [{ id: KITFIX_WORLD_MODE_ID, constantName: KITFIX_WORLD_CONSTANT }],
  sql: {
    files: ["sql/001-world.sql"],
    tables: [
      { name: "k_kitfix_checkpoint", zone: "per-zone" },
      { name: "k_kitfix_world_event", zone: "per-zone", role: "world-event" },
    ],
  },
  userKeys: [],
  workers: [{ id: "grant", entry: `apps/server/src/kits/${KITFIX_ID}/workers/grant.ts` }],
  contributions: {
    grants: {
      kind: "data",
      ends: ["server"],
      schema: {
        type: "object",
        required: ["kind", "amount"],
        properties: {
          kind: { type: "string", pattern: "^[a-z][A-Za-z0-9]{0,31}$" },
          amount: { type: "integer", minimum: 1 },
        },
      },
    },
  },
  category: "extra",
  docs: [`apps/kits/${KITFIX_ID}/README.md`],
  resident: false,
  routes: [],
  menu: [],
  viewDirs: [],
  views: [],
  owners: [],
};

const PLUGIN_JSON = {
  schemaVersion: 2,
  id: KITFIX_CONTENT_ID,
  version: "1.0.0",
  description: "MMO 框架侧完成矩阵夹具插件（MF11-B4）：建在 kitfix 上的纯内容插件，只经贡献点 grants 交一条可入账 kind；⛔ 不进生产",
  domains: [],
  requires: { kits: { [KITFIX_ID]: { default: 1 } } },
  contributes: { [KITFIX_ID]: { grants: `apps/plugins/${KITFIX_CONTENT_ID}/data/grants.json` } },
  category: "extra",
  docs: [`apps/plugins/${KITFIX_CONTENT_ID}/README.md`],
  resident: false,
  entry: `apps/client/src/plugins/${KITFIX_CONTENT_ID}/index.ts`,
  viewDirs: [],
  views: [],
  owners: [],
  routes: [],
  menu: [],
};

const MANIFEST_JSON = {
  schemaVersion: 1,
  id: KITFIX_WORLD_MODE_ID,
  constantName: KITFIX_WORLD_CONSTANT,
  modeVersion: 1,
  wireExposed: true,
  maxPlayers: 8,
  profiles: ["world"],
  kind: "world",
  world: { emptyPolicy: "sleep", emptyAfterMs: 120000, checkpointMs: 30000 },
};

const KIT_README = `# kitfix —— MMO 框架侧完成矩阵的夹具 kit（MF11-B4）

由 \`apps/server/tools/mmo-fixture-matrix/\` 在一次性检出里物化，⛔ 不进仓库工作树、⛔ 不进生产。内容：世界形态玩法 \`kitfixWorld\`
（= 框架夹具 worldFixture 改名重挂到 kit 下）、检查点 / 世界事件两表（\`sql/001-world.sql\`）、检查点端口（mode 目录）、grant worker、
贡献点 \`grants\`（data，server 端）与 api 面 \`default\`。矩阵证明：这些文件**只新增**即可让 codegen / sync / plugin check / protected-paths /
inventory / typecheck / K1 导入边界全部通过，且不改任何手写框架文件（docs/MMO.md §12 MF11）。可选额外功能状态见 docs/EXTRAS.md。
`;

const PLUGIN_README = `# kitfixContent —— MMO 框架侧完成矩阵的夹具插件（MF11-B4）

建在 kitfix kit 上的纯内容插件：\`requires.kits.kitfix.default = 1\`，\`contributes.kitfix.grants\` 交一条 \`{ kind, amount }\`（按 kit 声明的
schema 校验，渲染进 \`apps/server/src/kits/kitfix/contributions.generated.ts\`）；客户端 module 空实现（无 UI）。由
\`apps/server/tools/mmo-fixture-matrix/\` 在一次性检出里物化，⛔ 不进仓库工作树、⛔ 不进生产。可选额外功能状态见 docs/EXTRAS.md。
`;

const CHECKPOINT_TS = `/**
 * kitfix 检查点端口（MMO MF7b 形态的 kit 实现；MF11-B4 夹具矩阵物化自 test/fixtures/kitfixWorld.ts）：
 *  - save* 走框架给的世界事务句柄 \`tx.query\`（kit 表闸内，同一世界事务；同 rev 重放 1062 视为幂等）；
 *  - load* 走 kit-api \`withKitTx\`（kit 自己的读事务），取最大 rev。
 * 只经 WorldMode 契约类型（\`WorldModeCheckpointCapability\`）与 kit-api 门面消费，⛔ 不 import rooms/core 内核。
 */
import { withKitTx, type KitWorldTx, type ResultSetHeader, type RowDataPacket } from "../../../core/infra/kitApi";
import type { WorldModeCheckpointCapability } from "../../WorldMode";

type CheckpointPort = WorldModeCheckpointCapability["port"];
type CheckpointEnvelope = Parameters<CheckpointPort["saveInstance"]>[2];

export const KITFIX_ID = "kitfix";
export const KITFIX_CHECKPOINT_TABLE = "k_kitfix_checkpoint";
export const KITFIX_WORLD_EVENT_TABLE = "k_kitfix_world_event";
/** 快照 schema 版本窗口（框架加载期校验，不兼容 fail-closed）。 */
export const KITFIX_WORLD_CHECKPOINT_SCHEMA = { version: 1, minSupported: 1 } as const;

interface EnvelopeRow extends RowDataPacket { envelope: unknown }

class KitfixSqlCheckpointPort implements CheckpointPort {
    private async save(tx: KitWorldTx, scope: "instance" | "persona", keyId: string, envelope: CheckpointEnvelope): Promise<void> {
        try {
            await tx.query<ResultSetHeader>(
                \`INSERT INTO \${KITFIX_CHECKPOINT_TABLE} (server_id, scope, key_id, rev, envelope) VALUES (?, ?, ?, ?, CAST(? AS JSON))\`,
                [tx.sId, scope, keyId, envelope.rev, JSON.stringify(envelope)]);
        } catch (error) {
            if ((error as { errno?: unknown }).errno === 1062) return; // 同 rev 重放（提交丢响应）：幂等
            throw error;
        }
    }

    private load(sId: number, scope: "instance" | "persona", keyId: string): Promise<unknown | null> {
        return withKitTx(KITFIX_ID, sId, async (tx) => {
            const rows = await tx.query<EnvelopeRow[]>(
                \`SELECT envelope FROM \${KITFIX_CHECKPOINT_TABLE} WHERE server_id = ? AND scope = ? AND key_id = ? ORDER BY rev DESC LIMIT 1\`,
                [sId, scope, keyId]);
            const first = rows[0];
            if (first === undefined) return null;
            return typeof first.envelope === "string" ? (JSON.parse(first.envelope) as unknown) : first.envelope;
        });
    }

    saveInstance(tx: KitWorldTx, instanceId: string, envelope: CheckpointEnvelope): Promise<void> { return this.save(tx, "instance", instanceId, envelope); }
    loadInstance(sId: number, instanceId: string): Promise<unknown | null> { return this.load(sId, "instance", instanceId); }
    savePersona(tx: KitWorldTx, personaId: string, envelope: CheckpointEnvelope): Promise<void> { return this.save(tx, "persona", personaId, envelope); }
    loadPersona(sId: number, personaId: string): Promise<unknown | null> { return this.load(sId, "persona", personaId); }
}

/** 登记时装进 mode 的检查点能力：kitfix 两表 + 事件表。 */
export function createKitfixCheckpointCapability(): WorldModeCheckpointCapability {
    return { kitId: KITFIX_ID, port: new KitfixSqlCheckpointPort(), schema: KITFIX_WORLD_CHECKPOINT_SCHEMA, eventTable: KITFIX_WORLD_EVENT_TABLE };
}
`;

const WORKER_TS = `/**
 * kitfix grant worker（kit.json workers[].entry；MMO MF7a 形态；MF11-B4 夹具矩阵物化自 test/fixtures/kitfixWorld.ts createGrantWorker）：
 * 一轮 = 一条租约守卫事务——认领门内（checkpoint_rev ≤ 已落库 rev）的 grantCurrency 事件，逐条 credit（opId = eventId ⇒ 重放 DUP）；
 * 载荷的 kind 必须是插件经贡献点 \`grants\` 交来的 kind（\`./contributions.generated\`），非法载荷 ⇒ deadLetter，⛔ 不拖累整轮。
 * K1：只 import kit-api 门面与本 kit 目录。
 */
import { CUR_GOLD, defineKitWorker } from "../../../core/infra/kitApi";
import { KIT_CONTRIBUTIONS } from "../contributions.generated";

const KITFIX_WORLD_EVENT_TABLE = "k_kitfix_world_event";
/** 可入账 kind（kitfixContent 填充；无人填充 = 空集 ⇒ 全部死信）。 */
const GRANT_KINDS: ReadonlySet<string> = new Set(KIT_CONTRIBUTIONS.grants.map((entry) => entry.value.kind));

interface GrantPayload { readonly personaId: string; readonly userId: string; readonly amount: number; readonly kind: string }

function grantPayloadOf(raw: unknown): GrantPayload | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as { personaId?: unknown; userId?: unknown; amount?: unknown; kind?: unknown };
    if (typeof value.personaId !== "string" || typeof value.userId !== "string" || value.userId === "") return null;
    if (typeof value.kind !== "string" || !GRANT_KINDS.has(value.kind)) return null;
    if (!Number.isSafeInteger(value.amount) || (value.amount as number) <= 0) return null;
    return { personaId: value.personaId, userId: value.userId, amount: value.amount as number, kind: value.kind };
}

export default defineKitWorker({
    idleMs: 100,
    async pass(tx) {
        const claimed = await tx.claimWorldEvents(KITFIX_WORLD_EVENT_TABLE, { limit: 8 });
        for (const event of claimed) {
            const payload = event.kind === "grantCurrency" ? grantPayloadOf(event.payload) : null;
            if (payload === null) {
                await tx.deadLetterWorldEvent(KITFIX_WORLD_EVENT_TABLE, event.eventId);
                continue;
            }
            await tx.credit(payload.userId, CUR_GOLD, payload.amount, event.eventId, "world-event", { kind: "persona", personaId: payload.personaId });
        }
        return { more: claimed.length > 0 };
    },
});
`;

const API_DEFAULT_TS = `/** kitfix \`default\` api 面（kit.json api.default v1）：夹具 kit 没有对插件开放的运行时能力，面上只有版本常量；插件只能 import 这里。 */
export const KITFIX_API_DEFAULT_VERSION = 1;
`;

const CLIENT_MODULE_TS = `/**
 * kitfixWorld 客户端 GameplayModule（MMO MF11-B4 夹具矩阵）：canonical（wireExposed）玩法必须有一份 client module，这是它的最小合法形态。
 * 世界形态玩法**不经 GameRoom joiner 进入**（Lobby world.enter + WorldRoomTransport，docs/CLIENT.md §7 / MMO.md §4.6），kit 的客户端接线归 mmo kit MK1；
 * 本 module 只提供 launch 校验，joiner / plugin 一律拒绝并说明入口。
 */
import type { GameplayModule } from "../../../logic/gameplay/index";
import { GAMEPLAY_CATALOG } from "../../../shared/index";
import type { GameplayServicesContext } from "../../services";

export interface KitfixWorldLaunch {
    readonly profile?: string;
}

function validateKitfixWorldLaunch(input: unknown): KitfixWorldLaunch {
    if (input === undefined || input === null) return {};
    if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("[kitfixWorld] launch 必须是对象");
    for (const key of Object.keys(input as Record<string, unknown>)) {
        if (key !== "profile") throw new TypeError(\`[kitfixWorld] launch 未知字段：\${key}\`);
    }
    const profile = (input as { readonly profile?: unknown }).profile;
    if (profile === undefined) return {};
    const allowed: readonly string[] = GAMEPLAY_CATALOG.kitfixWorld.profiles;
    if (typeof profile !== "string" || !allowed.includes(profile)) {
        throw new TypeError("[kitfixWorld] launch.profile 不在 catalog 声明的 profiles 中");
    }
    return { profile };
}

const notViaGameRoom = (): never => {
    throw new Error("[kitfixWorld] 世界形态玩法不经 GameRoom joiner 进入：走 Lobby world.enter + WorldRoomTransport（docs/CLIENT.md §7）；kit 客户端接线归 mmo kit MK1");
};

/** generated catalog 的约定入口。 */
export function createGameplayModule(_services: GameplayServicesContext): GameplayModule<KitfixWorldLaunch, never, never> {
    return {
        id: "kitfixWorld",
        validateLaunch: validateKitfixWorldLaunch,
        joiner: { join: notViaGameRoom },
        createPlugin: notViaGameRoom,
    };
}
`;

const PLUGIN_ENTRY_TS = `/**
 * kitfixContent plugin module（PluginHost 装载单元；codegen:plugins 渲染为 plugins.generated 的静态字面量 \`load\`，
 * dependencies 里自动排在 kitfix kit 之后——来自 plugin.json 的 requires.kits）。纯内容插件：只经贡献点向 kitfix 交 grants 数据，客户端无 UI。
 */
import type { PluginModule } from "../../app/PluginHost";

export function createPluginModule(): PluginModule {
    return {
        install() {
            // 无客户端能力：贡献在构建期已渲染进 kit 的 contributions.generated.ts
        },
    };
}
`;

const GRANTS_JSON = { kind: "loot", amount: 5 };

function rename(source: string): string {
  return source
    .replaceAll("WORLD_FIXTURE", "KITFIX_WORLD")
    .replaceAll("WorldFixture", KITFIX_WORLD_CONSTANT)
    .replaceAll("worldFixture", KITFIX_WORLD_MODE_ID);
}

function replaceOnce(source: string, anchor: string, replacement: string, label: string): string {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[mmo-fixture-matrix] 派生 ${label} 失败：锚点出现 ${count} 次（期望 1）——worldFixture 变了，同步改 fixtures.ts：${anchor.trim().slice(0, 80)}`);
  return source.replace(anchor, replacement);
}

/** 由 test/fixtures/worldFixtureMode.ts 派生 kit 的 mode 文件（rooms/modes/kitfixWorld/index.ts）。 */
function deriveModeSource(fixtureSource: string): string {
  let out = rename(fixtureSource);
  out = replaceOnce(out, `from "../../src/rooms/WorldMode";`, `from "../../WorldMode";`, "mode import WorldMode");
  out = replaceOnce(out,
    `import type { KitfixWorldState } from "../../src/rooms/schema/GameRoomState";`,
    [
      `import type { KitfixWorldState } from "../../schema/GameRoomState";`,
      `import { worldModeRegistry, type WorldModeRegistry } from "../../WorldMode";`,
      `import { createKitfixCheckpointCapability } from "./checkpoint";`,
    ].join("\n"),
    "mode import GameRoomState");
  out = replaceOnce(out,
    `    const movers = new Map<string, string>();`,
    `    const movers = new Map<string, string>();\n    /** session → userId：durable 事件载荷随带账号 uid，worker 入账不回查 persona 表（kit ⛔ 直接碰它）。 */\n    const owners = new Map<string, string>();`,
    "owners map");
  out = replaceOnce(out,
    `            movers.set(session.session, id);`,
    `            movers.set(session.session, id);\n            owners.set(session.session, session.userId);`,
    "owners set");
  out = replaceOnce(out,
    `                movers.delete(session.session);`,
    `                movers.delete(session.session);\n                owners.delete(session.session);`,
    "owners delete");
  out = replaceOnce(out,
    `if (mover) context.events.append("grantCurrency", { personaId: mover.id.slice("mover-".length), amount });`,
    `if (mover) context.events.append("grantCurrency", { personaId: mover.id.slice("mover-".length), userId: owners.get(session) ?? "", amount, kind: "loot" });`,
    "loot payload");
  const header = [
    "/**",
    " * kitfixWorld 服务端 WorldMode（kits/kitfix 的世界形态玩法；MMO MF11-B4 夹具矩阵）：由 test/fixtures/worldFixtureMode.ts 派生（改名 + 登记函数 +",
    " * durable 事件载荷带 userId / kind），⛔ 手改；证明 kit 的 kind:\"world\" 玩法只新增 rooms/modes/<id>/ 即被 codegen 分表登进 worldModeRegistry。",
    " */",
  ].join("\n");
  const registration = [
    "",
    "// ── kit 登记（codegen `registerGeneratedWorldModes` 静态 import 本符号）──────────────────────────────────────────────",
    "",
    "/** 约定导出符号 `register<Constant>WorldMode`：登进 worldModeRegistry（检查点能力 = kitfix 两表 + 事件表）。 */",
    "export function registerKitfixWorldWorldMode(registry: WorldModeRegistry = worldModeRegistry): () => void {",
    "    return registry.register(KITFIX_WORLD_MODE_ID, () => createKitfixWorldMode({ checkpoint: createKitfixCheckpointCapability() }));",
    "}",
    "",
  ].join("\n");
  return `${header}\n${out.trimEnd()}\n${registration}`;
}

function deriveWireSource(fixtureSource: string): string {
  const header = "// kitfixWorld wire（MMO MF11-B4 夹具矩阵）：由 apps/shared/src/gameplays/worldFixture/wire.ts 改名派生，⛔ 手改。\n";
  return header + rename(fixtureSource);
}

function deriveVectorsSource(fixtureSource: string): string {
  const header = "// kitfixWorld 向量 sidecar（MMO MF11-B4 夹具矩阵）：由 apps/server/test/wire-vectors/worldFixture.ts 改名派生，⛔ 手改。\n";
  return header + rename(fixtureSource);
}

function deriveStateJson(fixtureSource: string): string {
  const text = rename(fixtureSource);
  JSON.parse(text); // 仍是合法 JSON
  return text;
}

export interface MaterializedFixtures {
  /** 写出的仓相对路径（排序）。 */
  readonly files: readonly string[];
}

function write(root: string, relative: string, content: string, written: string[]): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  written.push(relative);
}

function readTree(root: string, relative: string): string {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`[mmo-fixture-matrix] 派生源不存在：${relative}`);
  return fs.readFileSync(file, "utf8");
}

/** 把 kitfix + kitfixContent 物化进 `root`（一次性检出）；worldFixture 派生源也从 `root` 读（与被测树同一版本）。 */
export function materializeFixtures(root: string): MaterializedFixtures {
  const written: string[] = [];
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  // kitfix
  write(root, `apps/kits/${KITFIX_ID}/kit.json`, json(KIT_JSON), written);
  write(root, `apps/kits/${KITFIX_ID}/README.md`, KIT_README, written);
  write(root, `apps/kits/${KITFIX_ID}/sql/001-world.sql`, KITFIX_WORLD_SQL, written);
  write(root, `apps/kits/${KITFIX_ID}/gameplays/${KITFIX_WORLD_MODE_ID}/manifest.json`, json(MANIFEST_JSON), written);
  write(root, `apps/kits/${KITFIX_ID}/gameplays/${KITFIX_WORLD_MODE_ID}/state.json`,
    deriveStateJson(readTree(root, "apps/shared/schema/gameplays/worldFixture/state.json")), written);
  write(root, `apps/shared/src/gameplays/${KITFIX_WORLD_MODE_ID}/wire.ts`,
    deriveWireSource(readTree(root, "apps/shared/src/gameplays/worldFixture/wire.ts")), written);
  write(root, `apps/server/src/rooms/modes/${KITFIX_WORLD_MODE_ID}/index.ts`,
    deriveModeSource(readTree(root, "apps/server/test/fixtures/worldFixtureMode.ts")), written);
  write(root, `apps/server/src/rooms/modes/${KITFIX_WORLD_MODE_ID}/checkpoint.ts`, CHECKPOINT_TS, written);
  write(root, `apps/server/src/kits/${KITFIX_ID}/workers/grant.ts`, WORKER_TS, written);
  write(root, `apps/server/src/kits/${KITFIX_ID}/api/default/index.ts`, API_DEFAULT_TS, written);
  write(root, `apps/server/test/wire-vectors/${KITFIX_WORLD_MODE_ID}.ts`,
    deriveVectorsSource(readTree(root, "apps/server/test/wire-vectors/worldFixture.ts")), written);
  write(root, `apps/client/src/gameplay/modes/${KITFIX_WORLD_MODE_ID}/index.ts`, CLIENT_MODULE_TS, written);
  // kitfixContent
  write(root, `apps/plugins/${KITFIX_CONTENT_ID}/plugin.json`, json(PLUGIN_JSON), written);
  write(root, `apps/plugins/${KITFIX_CONTENT_ID}/README.md`, PLUGIN_README, written);
  write(root, `apps/plugins/${KITFIX_CONTENT_ID}/data/grants.json`, json(GRANTS_JSON), written);
  write(root, `apps/client/src/plugins/${KITFIX_CONTENT_ID}/index.ts`, PLUGIN_ENTRY_TS, written);
  return { files: [...written].sort() };
}

/** 夹具的客户端目录（Cocos 镜像要随包携带 Creator 的 .meta：pack 侧要求、安装侧不合成）。 */
const CLIENT_OWNED_DIRS: readonly string[] = [
  `apps/client/src/gameplay/modes/${KITFIX_WORLD_MODE_ID}`,
  `apps/client/src/plugins/${KITFIX_CONTENT_ID}`,
];

function creatorMeta(importer: "typescript" | "directory"): string {
  const ver = importer === "directory" ? "1.2.0" : "4.0.24";
  return `${JSON.stringify({ ver, importer, imported: true, uuid: randomUUID(), files: [], subMetas: {}, userData: {} }, null, 2)}\n`;
}

/**
 * 在 sync:client 已把客户端文件镜像到 apps/Cocos/assets/src 之后，为夹具自己的镜像目录 / 文件合成 Creator 形态的 .meta
 * （真实 kit 作者由 Creator 落盘；矩阵没有 Creator，按 tools/plugin/meta.ts 的内容闸形态合成：uuid 小写 8-4-4-4-12、importer 与类型相符）。
 * 返回写出的仓相对路径。
 */
export function materializeCreatorMeta(root: string): readonly string[] {
  const written: string[] = [];
  for (const clientDir of CLIENT_OWNED_DIRS) {
    const mirrorDir = `apps/Cocos/assets/src${clientDir.slice("apps/client/src".length)}`;
    const absolute = path.join(root, mirrorDir);
    if (!fs.existsSync(absolute)) throw new Error(`[mmo-fixture-matrix] 镜像目录不存在（先跑 sync:client）：${mirrorDir}`);
    fs.writeFileSync(`${absolute}.meta`, creatorMeta("directory"));
    written.push(`${mirrorDir}.meta`);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      fs.writeFileSync(path.join(absolute, `${entry.name}.meta`), creatorMeta("typescript"));
      written.push(`${mirrorDir}/${entry.name}.meta`);
    }
  }
  return written.sort();
}
