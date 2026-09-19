/**
 * MMO MF10-B4 多进程接管实验（docs/MMO.md §5.4 MF10「多进程实验报告」；⛔ 非首版闸、⛔ 不进 verify:core）——`tools/m0/colyseus-redis-probe.ts` 形态：
 *  编排进程 spawn 两个 world 节点子进程（A / B，各自独立 Colyseus server + 真 Redis coord 租约 / 凭据 / 登记 + 真 MySQL 状态机 + kitfix 检查点表），
 *  客户端（@colyseus/sdk）经 `world.enter`（生产 deps：目录分配 + 登记端点）拿凭据 → 进 A 的世界房 → 走路（周期检查点落盘）→ **kill -9 A** →
 *  等租约 / 登记过期 → 再 `world.enter`（端点已回落）→ 进 B（Recovering 从检查点回灌，权威 epoch +1）→ 记录接管时延与位置回退，写报告到
 *  `docs/perf/world-bench/<时间戳>-multi-process.json`。
 * 不启用 RedisDriver / Presence（D27：客户端由 world.enter 直连节点，节点之间不共享房间列表）；每节点 WORLD_PUBLIC_WS_URL 指向自己。
 *
 * 用法（前置：本地栈已起 + db:bootstrap）：
 *   npm --workspace @game/server exec tsx -- tools/world-bench/multi-process.ts [--lease-ttl 3000] [--checkpoint-ms 2000] [--out docs/perf/world-bench] [--no-write]
 * 环境：BENCH_PORT_A / BENCH_PORT_B（默认 3801 / 3802）。子进程模式：`--node --port N`（由编排进程拉起）。
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Room } from "@colyseus/sdk";
import type { IWorldFixturePos, IWorldRoomJoinOptions } from "@game/shared";

const SELF = fileURLToPath(import.meta.url);
const SERVER_DIR = path.resolve(path.dirname(SELF), "../..");
const REPO_ROOT = path.resolve(SERVER_DIR, "../..");
const { values: args } = parseArgs({
  options: {
    node: { type: "boolean", default: false },
    port: { type: "string", default: "" },
    "lease-ttl": { type: "string", default: "3000" },
    "checkpoint-ms": { type: "string", default: "2000" },
    out: { type: "string", default: "docs/perf/world-bench" },
    "no-write": { type: "boolean", default: false },
  },
});
const LEASE_TTL_MS = Number(args["lease-ttl"]);
const RENEW_MS = Math.max(200, Math.floor(LEASE_TTL_MS / 3));
const CHECKPOINT_MS = Number(args["checkpoint-ms"]);
const SID = 0;

// ═══════════════════════════ 子进程模式：单个 world 节点 ═══════════════════════════
async function runNode(): Promise<void> {
  const port = Number(args.port);
  if (!port) throw new Error("--node 模式必须提供 --port");
  // 会话校验走 dev 身份提供者（AUTH_PROVIDER=dev；与合体入口 app.config 同口径）：编排进程 issueSession 写的 dev token 索引在 Redis，跨进程可验
  const { createDevAuthProvider } = await import("../../src/platform/devAuthProvider");
  const { installWebPlatformClient } = await import("../../src/platform/webPlatformClient");
  installWebPlatformClient(createDevAuthProvider());
  const { Server } = await import("colyseus");
  const { WebSocketTransport } = await import("@colyseus/ws-transport");
  const { RoomName } = await import("@game/shared");
  const { getPool } = await import("../../src/core/infra/mysql");
  const { withKitWorldTx } = await import("../../src/core/infra/kitApi");
  const { WorldRoom } = await import("../../src/rooms/WorldRoom");
  const { worldModeRegistry } = await import("../../src/rooms/WorldMode");
  const { WorldCheckpointer } = await import("../../src/rooms/core/WorldCheckpoint");
  const { WorldLease, defaultWorldLeaseDeps } = await import("../../src/rooms/core/WorldLease");
  const { RedisWorldRegistry } = await import("../../src/rooms/core/WorldRegistry");
  const { KITFIX_ID, KITFIX_WORLD_EVENT_TABLE, SqlCheckpointPort } = await import("../../test/fixtures/kitfixWorld");
  const { WORLD_FIXTURE_CHECKPOINT_SCHEMA, WORLD_FIXTURE_MODE_ID, createWorldFixtureMode } = await import("../../test/fixtures/worldFixtureMode");
  const port_ = new SqlCheckpointPort({ query: (sql, params) => getPool().query(sql, params) as never });
  const capability = { kitId: KITFIX_ID, port: port_, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: KITFIX_WORLD_EVENT_TABLE };
  const worldEventTables = (kitId: string): readonly string[] => (kitId === KITFIX_ID ? [KITFIX_WORLD_EVENT_TABLE] : []);
  worldModeRegistry.register(WORLD_FIXTURE_MODE_ID, () => createWorldFixtureMode({ capacity: 8, staticCount: 2, checkpoint: capability }) as never);
  // 登记 TTL 与租约同节拍（实验参数化的租约 ttl）
  const registry = new RedisWorldRegistry(undefined, LEASE_TTL_MS);
  class BenchWorldRoom extends WorldRoom {
    constructor() {
      super({
        lease: { acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder, { ...defaultWorldLeaseDeps, ttlMs: LEASE_TTL_MS, renewMs: RENEW_MS }) },
        world: { emptyPolicy: "run", emptyAfterMs: 120_000, checkpointMs: CHECKPOINT_MS },
        checkpointer: new WorldCheckpointer(capability, SID, { withWorldTx: (kitId, sId, scope, fn, deps) => withKitWorldTx(kitId, sId, scope, fn, { worldEventTables, ...deps }) }),
        drainGraceMs: 100,
        registry,
        publicAddress: `ws://127.0.0.1:${port}`,
        holder: `bench-node-${port}`,
      });
    }
  }
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false, greet: false, devMode: false });
  server.define(RoomName.World, BenchWorldRoom).filterBy(["sId", "mode", "profile", "mapId", "line"]);
  await server.listen(port);
  process.send?.({ ready: true, port });
  console.log(`[bench-node ${port}] listening`);
}

// ═══════════════════════════ 编排模式 ═══════════════════════════
async function orchestrate(): Promise<void> {
  const { Client: SDKClient } = await import("@colyseus/sdk");
  const { C2S, GAMEPLAY_CATALOG, RoomName, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase } = await import("@game/shared");
  const { withKitTx } = await import("../../src/core/infra/kitApi");
  const { kWorldFence, kWorldInfo, kWorldLease } = await import("../../src/core/infra/keys");
  const { closeMysql, getPool } = await import("../../src/core/infra/mysql");
  const { closeRedis, coordClient } = await import("../../src/core/infra/redisRoute");
  const { handleWorldEnter } = await import("../../src/core/world/enterRpc");
  const { readControl, readInstance } = await import("../../src/rooms/core/control");
  const { worldDirectory } = await import("../../src/rooms/core/WorldDirectory");
  const { KITFIX_CHECKPOINT_TABLE, KITFIX_ID, KITFIX_WORLD_EVENT_TABLE, KITFIX_WORLD_SQL } = await import("../../test/fixtures/kitfixWorld");
  const { WORLD_FIXTURE_MODE_ID } = await import("../../test/fixtures/worldFixtureMode");
  const { assertRedisUp, issueSession, sleep, testUid } = await import("../../test/int/helpers");
  const { gitCommit, stamp, writeReport } = await import("./report");

  const PORT_A = Number(process.env.BENCH_PORT_A ?? 3801);
  const PORT_B = Number(process.env.BENCH_PORT_B ?? 3802);
  const MAP_ID = `bench-${testUid("mp").slice(-10)}`.slice(0, 48);
  await assertRedisUp();
  const pool = getPool();
  for (const statement of KITFIX_WORLD_SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
    await pool.query(statement.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
  }
  const uid = testUid("mp").slice(0, 32);
  const persona = await withKitTx(KITFIX_ID, SID, (tx) => tx.createPersona(uid, 0));
  const children: ChildProcess[] = [];
  const spawnNode = (port: number): Promise<ChildProcess> => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", SELF, "--node", "--port", String(port), "--lease-ttl", String(LEASE_TTL_MS), "--checkpoint-ms", String(CHECKPOINT_MS)], {
      cwd: SERVER_DIR, stdio: ["ignore", "inherit", "inherit", "ipc"], env: { ...process.env, AUTH_PROVIDER: "dev", WORLD_PUBLIC_WS_URL: `ws://127.0.0.1:${port}` },
    });
    children.push(child);
    const timer = setTimeout(() => reject(new Error(`node ${port} 未就绪`)), 30_000);
    child.on("message", (message) => { if ((message as { ready?: boolean }).ready) { clearTimeout(timer); resolve(child); } });
    child.on("exit", (code) => { if (code !== null && code !== 0) console.warn(`[bench] node ${port} exit ${code}`); });
  });
  const waitFor = async (predicate: () => Promise<boolean> | boolean, label: string, timeoutMs: number): Promise<number> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await predicate()) return Date.now() - started;
      await sleep(50);
    }
    throw new Error(`超时：${label}`);
  };
  const report: Record<string, unknown> = {
    scenario: "multi-process", generatedAt: new Date().toISOString(), commit: gitCommit(REPO_ROOT),
    params: { leaseTtlMs: LEASE_TTL_MS, renewMs: RENEW_MS, checkpointMs: CHECKPOINT_MS, mapId: MAP_ID, ports: [PORT_A, PORT_B] },
    notes: [
      "D27 形态：不启用 RedisDriver / Presence，客户端由 world.enter（目录分配 + 登记端点）直连节点；节点之间不共享房间列表。",
      "登记（kWorldInfo）与租约同 TTL：节点被 kill -9 后两者一起到期，world.enter 的端点回落到空串（= 由部署层选任一节点，本实验选 B）。",
      "位置回退 ≤ 1 个 checkpointMs（周期检查点）；A 崩溃后没有强制点。",
    ],
  };
  let rooms: Room[] = [];
  try {
    const a = await spawnNode(PORT_A);
    const b = await spawnNode(PORT_B);
    const { token } = await issueSession(uid, null, "", SID);
    const options = (mapId: string, line: number, ticket: string): IWorldRoomJoinOptions => ({
      v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: WORLD_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion,
      profile: "world", mapId, line, personaId: persona, ticket,
    });
    const connect = async (endpoint: string, mapId: string, line: number, ticket: string): Promise<Room> => {
      const sdk = new SDKClient(endpoint);
      sdk.auth.token = token;
      const room = await sdk.joinOrCreate(RoomName.World, options(mapId, line, ticket));
      rooms.push(room);
      await waitFor(() => (JSON.parse(JSON.stringify(room.state)) as { phase: string }).phase === WorldPhase.Active, "Active", 15_000);
      return room;
    };
    // ① 进 A：首次 enter 时无登记 ⇒ endpoint 空串 ⇒ 部署层选节点（这里选 A）
    const enter1 = await handleWorldEnter(uid, SID, { personaId: persona, mapId: MAP_ID });
    report.enter1 = { line: enter1.line, endpoint: enter1.endpoint };
    const roomA = await connect(enter1.endpoint || `ws://127.0.0.1:${PORT_A}`, enter1.mapId, enter1.line, enter1.ticket);
    const instance = await worldDirectory.resolve(SID, MAP_ID, enter1.line);
    const positions: number[] = [];
    roomA.onMessage(S2C.WorldFixturePos, (payload: IWorldFixturePos) => { positions.push(payload.x); });
    roomA.send(C2S.WorldFixtureMove, { dirX: 1, dirY: 0, seq: 1 });
    await waitFor(async () => (await coordClient().hgetall(kWorldInfo(SID, instance.instanceId))).publicAddress === `ws://127.0.0.1:${PORT_A}`, "A 登记节点地址", 5_000);
    const enterWhileA = await handleWorldEnter(uid, SID, { personaId: persona, mapId: MAP_ID });
    report.endpointWhileA = enterWhileA.endpoint;
    await sleep(CHECKPOINT_MS * 2 + 500); // 至少一个周期检查点已落盘
    const epochBefore = (await readInstance(SID, instance.instanceId))?.authorityEpoch ?? -1;
    const checkpointRevBefore = (await readInstance(SID, instance.instanceId))?.checkpointRev ?? -1;
    const xAtKill = positions.at(-1) ?? -1;
    // ② kill -9 A
    const killedAt = Date.now();
    a.kill("SIGKILL");
    rooms = rooms.filter((room) => room !== roomA);
    const leaseExpiredMs = await waitFor(async () => (await coordClient().exists(kWorldLease(SID, instance.instanceId))) === 0, "租约过期", LEASE_TTL_MS * 3);
    const infoExpiredMs = await waitFor(async () => (await coordClient().exists(kWorldInfo(SID, instance.instanceId))) === 0, "登记过期", LEASE_TTL_MS * 3);
    // ③ 再 enter：端点已回落 ⇒ 选 B ⇒ B Recovering 接管
    const enter2 = await handleWorldEnter(uid, SID, { personaId: persona, mapId: MAP_ID });
    report.enter2 = { line: enter2.line, endpoint: enter2.endpoint, transferId: enter2.transferId };
    const roomB = await connect(enter2.endpoint || `ws://127.0.0.1:${PORT_B}`, enter2.mapId, enter2.line, enter2.ticket);
    const takeoverMs = Date.now() - killedAt;
    const posAfter: number[] = [];
    roomB.onMessage(S2C.WorldFixturePos, (payload: IWorldFixturePos) => { posAfter.push(payload.x); });
    roomB.send(C2S.WorldFixtureMove, { dirX: 0, dirY: 0, seq: 2 });
    await waitFor(() => posAfter.length > 0, "B 回执", 5_000);
    const after = await readInstance(SID, instance.instanceId);
    const control = await readControl(SID, persona);
    const infoB = await coordClient().hgetall(kWorldInfo(SID, instance.instanceId));
    report.result = {
      leaseExpiredAfterKillMs: leaseExpiredMs, registryExpiredAfterKillMs: infoExpiredMs, takeoverMs,
      authorityEpoch: { before: epochBefore, after: after?.authorityEpoch ?? -1 }, holderAfter: after?.holder ?? "",
      checkpointRev: { before: checkpointRevBefore, after: after?.checkpointRev ?? -1 },
      position: { xAtKill, xAfterTakeover: posAfter[0] ?? -1, rollback: xAtKill - (posAfter[0] ?? xAtKill) },
      controlEpochAfter: control?.controlEpoch ?? -1, controlWorldAddress: control?.worldAddress ?? null,
      registryAfter: { publicAddress: infoB.publicAddress ?? null, seated: infoB.seated ?? null },
    };
    report.verdict = {
      takeover: after?.authorityEpoch === epochBefore + 1 && (after?.holder ?? "").endsWith(String(PORT_B)) ? "ok" : "FAILED",
      rollbackWithinOnePeriod: (xAtKill - (posAfter[0] ?? xAtKill)) <= Math.ceil(CHECKPOINT_MS / 50) * 2 + 2 ? "ok" : "CHECK",
      endpointFallback: enter2.endpoint === "" && enterWhileA.endpoint === `ws://127.0.0.1:${PORT_A}` ? "ok" : "CHECK",
    };
    console.log(JSON.stringify(report, null, 2));
    if (!args["no-write"]) {
      const file = writeReport(path.resolve(REPO_ROOT, args.out), `${stamp()}-multi-process`, report);
      console.log(`[bench] 报告已写：${path.relative(REPO_ROOT, file)}`);
    }
    void b;
  } finally {
    for (const room of rooms) { try { await Promise.race([room.leave(), sleep(1_000)]); } catch { /* closed */ } }
    for (const child of children) { if (child.exitCode === null) child.kill("SIGKILL"); }
    try {
      const [rows] = await pool.query<Array<{ instance_id: string }> & import("mysql2").RowDataPacket[]>("SELECT instance_id FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
      for (const row of rows) {
        await coordClient().unlink(kWorldLease(SID, row.instance_id), kWorldFence(SID, row.instance_id), kWorldInfo(SID, row.instance_id));
        await pool.execute(`DELETE FROM ${KITFIX_CHECKPOINT_TABLE} WHERE server_id = ? AND key_id = ?`, [SID, row.instance_id]);
        await pool.execute(`DELETE FROM ${KITFIX_WORLD_EVENT_TABLE} WHERE server_id = ? AND instance_id = ?`, [SID, row.instance_id]);
        worldDirectory.forget(SID, row.instance_id);
      }
      await pool.execute(`DELETE FROM ${KITFIX_CHECKPOINT_TABLE} WHERE server_id = ? AND key_id = ?`, [SID, persona]);
      await pool.execute("DELETE FROM world_transfer WHERE server_id = ? AND persona_id = ?", [SID, persona]);
      await pool.execute("DELETE FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MAP_ID]);
      await pool.execute("DELETE FROM persona WHERE user_id = ?", [uid]);
    } catch (error) {
      console.warn("[bench] 清理失败", error);
    }
    await closeRedis();
    await closeMysql();
  }
}

if (args.node) {
  runNode().catch((error) => { console.error(error); process.exit(1); });
} else {
  orchestrate().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
