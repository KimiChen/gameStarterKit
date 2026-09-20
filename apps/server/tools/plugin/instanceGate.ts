/**
 * 卸载 kit 的分线闸（MMO MK4-B3；docs/MMO-PLAN.md MK4-B3「`uninstall` 在…运行中分线时拒」、docs/MMO.md §10.3「kit 已形成」①）：
 * 该 kit 的 world mode 还有**运行中**的分线 ⇒ 拒——卸载会删掉承载它们的 mode / kit 代码与生成物，房间下一次重建 / 重启即拒启，
 * 在座 persona 的控制权与检查点链悬空。
 *  - 运行中 = 该分线的 Redis 权威租约键 `kWorldLease(sId, instanceId)` 存在（rooms/core/WorldLease.ts：「谁在跑这条分线」；房清退时释放、
 *    崩溃后按 WORLD_LEASE_TTL_MS 过期；sleep 策略的空分线仍续租 ⇒ 仍算运行中）；
 *  - 归属 = 权威房登记 HASH `kWorldInfo` 的 `mode` 字段（rooms/core/WorldRegistry.ts，MK4-B3 起随 seated / capacity 一起发布）∈ 该 kit 的 mode 清单；
 *  - 候选行来自 MySQL `world_instance`（全部 server_id，有界 4096 行）。⛔ 不按 `state` 判运行：崩溃遗留的 active 行没人改回 offline，靠它会永久
 *    卡死卸载；⛔ 不按 `updated_at` 判：sleep 的空分线不写 MySQL 却仍续租。
 * 规则：租约在 ∧ mode ∈ kit ⇒ 拒；租约在 ∧ mode 缺（recovering 未发布 / draining 登记已过期 / 旧发布方）⇒ 无法归属 ⇒ 也拒（fail-closed）；
 * kit 无 mode（纯 SQL / 服务 kit）⇒ 不可能持有分线 ⇒ 跳过；连不上 MySQL / coord Redis、查询失败、候选行超界一律拒；⛔ 无 bypass flag
 * （先 drain / 停掉承载分线的 world 进程，等租约释放或过期）。`plugin -- check` 用同一读只告警。
 * 连接面可注入（单测假连接 / 假 Redis，⛔ 不连真库）；真库形态在 test/int/kit-instance-gate.test.ts 核对。
 * 变异验证：inspectKitInstances 不查租约键 → 「崩溃遗留 active 行不挡」转红；不查 mode 归属 → 「别的 kit 的分线不挡」转红；
 * 删「无法归属也拒」→ 「登记缺 mode fail-closed」转红。
 */
import Redis from "ioredis";
import { REDIS_COORD_URL } from "../../src/core/infra/config";
import { kWorldInfo, kWorldLease } from "../../src/core/infra/keys";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { defaultOutboxConnection } from "./outboxGate";
import type { WorkerGateSqlConn, WorkerGateSqlConnection } from "./workerGate";

const KIT_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;
const MODE_ID_RE = /^[a-z][A-Za-z0-9]{0,63}$/u;

/** 候选行上限（有界扫描；分线数 ≤ 图数 × WORLD_MAX_LINES_PER_MAP，超界视为异常 ⇒ 拒）。 */
export const WORLD_INSTANCE_SCAN_LIMIT = 4096;
/** 多取一行判超界。 */
export const WORLD_INSTANCE_ROWS_SQL =
  `SELECT server_id, instance_id, map_id, line, state, holder FROM world_instance ORDER BY server_id, map_id, line LIMIT ${WORLD_INSTANCE_SCAN_LIMIT + 1}`;

/** 最小 Redis 面：ioredis Redis 与测试假客户端都满足。 */
export interface InstanceGateRedis {
  exists(key: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  quit(): Promise<unknown>;
}

export interface WorldLineRow {
  readonly sId: number;
  readonly instanceId: string;
  readonly mapId: string;
  readonly line: number;
  readonly state: string;
  readonly holder: string;
}

export interface LiveWorldLine extends WorldLineRow {
  /** 登记的 mode；null = 登记缺失 / 未带 mode。 */
  readonly mode: string | null;
}

export interface KitInstanceState {
  /** 权威租约在且 mode ∈ kit 的分线。 */
  readonly running: readonly LiveWorldLine[];
  /** 权威租约在但无法归属 mode 的分线（fail-closed 计入拒绝）。 */
  readonly unattributed: readonly LiveWorldLine[];
  /** 扫过的候选行数。 */
  readonly scanned: number;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** WorldAddress 字符串形（与 rooms/core/WorldDirectory.worldAddressOf 同形；本文件不 import 内核）。 */
export const worldLineAddress = (row: WorldLineRow): string => `s${row.sId}/${row.mapId}/${row.line}`;

export function describeLine(line: LiveWorldLine): string {
  return `${worldLineAddress(line)} holder=${line.holder || "-"}${line.mode === null ? "" : ` mode=${line.mode}`}`;
}

/** 生成目录里该 kit 的 mode id（目录无该 kit ⇒ 空）。 */
export function kitModeIdsOf(kit: Pick<ServerKitCatalogEntry, "modes"> | undefined): string[] {
  return kit === undefined ? [] : kit.modes.map((mode) => mode.id);
}

function assertModeIds(modeIds: readonly string[]): void {
  for (const modeId of modeIds) {
    if (!MODE_ID_RE.test(modeId)) { throw new Error(`[plugin] mode id 非法：${modeId}`); }
  }
}

/** 读候选行（有界）；形状异常 / 超界 ⇒ 抛。 */
export async function readWorldLineRows(conn: WorkerGateSqlConn): Promise<WorldLineRow[]> {
  const [rows] = await conn.query(WORLD_INSTANCE_ROWS_SQL);
  if (!Array.isArray(rows)) { throw new Error("[plugin] world_instance 读取返回形状异常"); }
  if (rows.length > WORLD_INSTANCE_SCAN_LIMIT) { throw new Error(`[plugin] world_instance 候选行超过 ${WORLD_INSTANCE_SCAN_LIMIT}（有界扫描，fail-closed）`); }
  return rows.map((raw, index) => {
    if (!isRecord(raw)) { throw new Error(`[plugin] world_instance 第 ${index} 行形状异常：${JSON.stringify(raw)}`); }
    const sId = Number(raw.server_id);
    const line = Number(raw.line);
    const instanceId = typeof raw.instance_id === "string" ? raw.instance_id : "";
    if (!Number.isInteger(sId) || sId < 0 || !Number.isInteger(line) || line < 0 || instanceId === "") {
      throw new Error(`[plugin] world_instance 第 ${index} 行字段异常：${JSON.stringify(raw)}`);
    }
    return { sId, instanceId, mapId: String(raw.map_id ?? ""), line, state: String(raw.state ?? ""), holder: String(raw.holder ?? "") };
  });
}

/** 逐行核租约 + 登记 mode；⛔ 不判 state / updated_at（见抬头）。 */
export async function inspectKitInstances(conn: WorkerGateSqlConn, redis: Pick<InstanceGateRedis, "exists" | "hget">, modeIds: readonly string[]): Promise<KitInstanceState> {
  assertModeIds(modeIds);
  const rows = await readWorldLineRows(conn);
  const running: LiveWorldLine[] = [];
  const unattributed: LiveWorldLine[] = [];
  const modes = new Set(modeIds);
  for (const row of rows) {
    const held = await redis.exists(kWorldLease(row.sId, row.instanceId));
    if (held !== 1) continue;
    const mode = await redis.hget(kWorldInfo(row.sId, row.instanceId), "mode");
    const live: LiveWorldLine = { ...row, mode: typeof mode === "string" && mode.length > 0 ? mode : null };
    if (live.mode === null) unattributed.push(live);
    else if (modes.has(live.mode)) running.push(live);
  }
  return { running, unattributed, scanned: rows.length };
}

/** 缺省 coord Redis 客户端（REDIS_COORD_URL；世界租约 / 登记键所在实例）：独立连接，用完 quit，⛔ 不碰 redisRoute 的共享客户端表。 */
export async function defaultInstanceGateRedis(url: string = REDIS_COORD_URL()): Promise<InstanceGateRedis> {
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 5_000 });
  try {
    await client.connect();
  } catch (error) {
    client.disconnect();
    throw error;
  }
  return client;
}

export interface KitInstanceGateOptions {
  readonly kitId: string;
  /** 该 kit 的 mode id（锁 manifest ∪ 生成目录）；空 ⇒ 跳过（kit 不可能持有分线）。 */
  readonly modeIds: readonly string[];
  /** 缺省按 MYSQL_URL 开 mysql2 连接；单测注入假连接。 */
  readonly connect?: () => Promise<WorkerGateSqlConnection>;
  /** 缺省按 REDIS_COORD_URL 开 ioredis；单测注入假客户端。 */
  readonly connectRedis?: () => Promise<InstanceGateRedis>;
  readonly log?: (line: string) => void;
}

async function withGateConnections<T>(
  kitId: string,
  options: Pick<KitInstanceGateOptions, "connect" | "connectRedis">,
  body: (conn: WorkerGateSqlConnection, redis: InstanceGateRedis) => Promise<T>,
): Promise<T> {
  let conn: WorkerGateSqlConnection;
  try {
    conn = await (options.connect ?? defaultOutboxConnection)();
  } catch (error) {
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：连不上 MySQL，无法确认没有运行中分线（fail-closed）：${errorText(error)}`);
  }
  let redis: InstanceGateRedis;
  try {
    redis = await (options.connectRedis ?? defaultInstanceGateRedis)();
  } catch (error) {
    await conn.end().catch(() => undefined);
    throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：连不上 coord Redis，无法核对分线权威租约（fail-closed）：${errorText(error)}`);
  }
  try {
    return await body(conn, redis);
  } finally {
    await conn.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
  }
}

/**
 * 卸载前的闸：运行中分线 > 0 或在租分线无法归属 ⇒ 拒；连不上库 / 查询失败一律拒（fail-closed）；⛔ 无 bypass。
 * 返回核对结果（running / unattributed 恒空）；kit 无 mode ⇒ 不连库直接返回 scanned 0。
 */
export async function assertKitInstancesStopped(options: KitInstanceGateOptions): Promise<KitInstanceState> {
  const { kitId } = options;
  if (!KIT_ID_RE.test(kitId)) { throw new Error(`[plugin] kit id 非法：${kitId}`); }
  assertModeIds(options.modeIds);
  if (options.modeIds.length === 0) {
    options.log?.(`world_instance：kit "${kitId}" 无 mode（纯 SQL / 服务 kit），分线闸跳过`);
    return { running: [], unattributed: [], scanned: 0 };
  }
  const state = await withGateConnections(kitId, options, async (conn, redis) => {
    try {
      return await inspectKitInstances(conn, redis, options.modeIds);
    } catch (error) {
      throw new Error(`[plugin] 拒绝卸载 kit "${kitId}"：分线状态查询失败（fail-closed）：${errorText(error)}`);
    }
  });
  if (state.running.length > 0) {
    throw new Error(
      `[plugin] 拒绝卸载 kit "${kitId}"：还有 ${state.running.length} 条分线在该 kit 的 mode 下运行（权威租约在）：${state.running.map(describeLine).join("、")}`
      + "——先 drain / 停掉承载它们的 world 进程，等租约释放（清退）或过期（崩溃后 ≤ WORLD_LEASE_TTL_MS）再卸载；⛔ 本闸无 bypass flag",
    );
  }
  if (state.unattributed.length > 0) {
    throw new Error(
      `[plugin] 拒绝卸载 kit "${kitId}"：有 ${state.unattributed.length} 条在租分线无法归属 mode（登记缺 mode：recovering 未发布 / draining 登记已过期 / 旧发布方）：`
      + `${state.unattributed.map(describeLine).join("、")}——fail-closed，等其登记或停掉再卸载；⛔ 本闸无 bypass flag`,
    );
  }
  options.log?.(`world_instance：扫 ${state.scanned} 行，kit "${kitId}"（mode ${options.modeIds.join(" / ")}）无运行中分线 ✔`);
  return state;
}

/** `plugin -- check`：同一读只告警（运行中 / 无法归属各一条；连不上库只给「未核」）。 */
export async function describeKitInstanceBacklog(
  kitIds: readonly string[],
  catalog: readonly ServerKitCatalogEntry[],
  connect: () => Promise<WorkerGateSqlConnection> = defaultOutboxConnection,
  connectRedis: () => Promise<InstanceGateRedis> = defaultInstanceGateRedis,
): Promise<string[]> {
  const withModes = kitIds
    .map((kitId) => ({ kitId, modeIds: kitModeIdsOf(catalog.find((kit) => kit.id === kitId)) }))
    .filter((entry) => entry.modeIds.length > 0);
  if (withModes.length === 0) { return []; }
  let conn: WorkerGateSqlConnection;
  try {
    conn = await connect();
  } catch (error) {
    return [`⚠ 未核运行中分线（连不上 MySQL：${errorText(error)}）——卸载 kit 时会再次核对并 fail-closed`];
  }
  let redis: InstanceGateRedis;
  try {
    redis = await connectRedis();
  } catch (error) {
    await conn.end().catch(() => undefined);
    return [`⚠ 未核运行中分线（连不上 coord Redis：${errorText(error)}）——卸载 kit 时会再次核对并 fail-closed`];
  }
  try {
    const lines: string[] = [];
    let unattributed: readonly LiveWorldLine[] = [];
    for (const entry of withModes) {
      const state = await inspectKitInstances(conn, redis, entry.modeIds);
      if (state.running.length > 0) {
        lines.push(`⚠ kit "${entry.kitId}" 有 ${state.running.length} 条分线在运行（${state.running.map(describeLine).join("、")}）：uninstall 会拒绝，先 drain / 停 world 进程`);
      }
      unattributed = state.unattributed;
    }
    if (unattributed.length > 0) {
      lines.push(`⚠ 有 ${unattributed.length} 条在租分线无法归属 mode（${unattributed.map(describeLine).join("、")}）：kit 卸载会 fail-closed 拒绝`);
    }
    return lines;
  } catch (error) {
    return [`⚠ 未核运行中分线（查询失败：${errorText(error)}）`];
  } finally {
    await conn.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
  }
}
