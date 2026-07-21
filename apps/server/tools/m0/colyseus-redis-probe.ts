/**
 * M0 硬闸 ①：Colyseus 0.17 定向建房 + RedisDriver / RedisPresence 实测（10·M0）。
 *
 * 实测三件事（结论写入 docs/SERVER.md）：
 *  (a) RedisDriver/RedisPresence 下，跨进程房间列表与匹配（joinOrCreate 命中他进程的房）是否工作
 *  (b) 能否「在指定节点建房」—— 0.17 的 `ServerOptions.selectProcessIdToCreateRoom`
 *      （node_modules/@colyseus/core/src/Server.ts L49、MatchMaker.ts L461-465 已核对源码，非凭记忆）：
 *      createRoom 时回调选 processId；选中非本进程则经 presence pub/sub IPC（频道 `p:{processId}`）
 *      让目标进程 handleCreateRoom，seat reservation 带回目标进程的 publicAddress，客户端直连目标进程
 *  (c) 进程被 kill -9 后，残留房间/统计的清理机制（懒触发健康检查，非定时）
 *
 * 结构：单脚本双模式。
 *  - 编排模式（默认）：spawn 两个 `--server` 子进程（A=3701 / B=3702），逐项断言，结束清理
 *  - `--server` 子进程模式：起一个 Colyseus server（RedisDriver + RedisPresence 连 durable 6401 的 db 9）
 *
 * 隔离：探针用 redis db 9（业务在 db 0），结束 SCAN+UNLINK 清空 db 9 的探针 key
 * （`roomcaches` / `roomcount` 是 driver/presence 的固定 key 名，不可加前缀——所以用独立 db）。
 * ⚠ Redis pub/sub 不分 db，但探针频道名（`p:*` / `$roomId`）与业务频道不冲突。
 * ⚠ 「db 9 隔离」**仅探针场景成立**（单个 Colyseus 部署 vs 无 Colyseus 的业务键），
 *   ⛔ 不构成多项目先例：两个完整 Colyseus 部署的 `$lobby` 等固定频道跨 db 必撞——
 *   多项目横向扩展必须独立 Redis 实例（见 app.config.ts / SERVER.md 多项目段）。
 *
 * 用法: npm --workspace @game/server exec tsx -- tools/m0/colyseus-redis-probe.ts
 * 环境: PROBE_REDIS_URL（默认 redis://127.0.0.1:6401/9）、PROBE_PORT_A/B（默认 3701/3702）
 */
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const SELF = fileURLToPath(import.meta.url);
const SERVER_DIR = dirname(dirname(dirname(SELF))); // apps/server
const REDIS_URL = process.env.PROBE_REDIS_URL ?? "redis://127.0.0.1:6401/9";
const PORT_A = Number(process.env.PROBE_PORT_A ?? 3701);
const PORT_B = Number(process.env.PROBE_PORT_B ?? 3702);
const ROOM = "probe_room";

// ═══════════════════════════ 子进程模式：单节点 Colyseus server ═══════════════════════════

async function runServer(): Promise<void> {
  // 动态 import：编排模式不加载 colyseus，避免编排进程也注册 graceful shutdown 钩子
  const { defineRoom, defineServer, createRouter, createEndpoint, matchMaker, Room } =
    await import("@colyseus/core");
  const { schema } = await import("@colyseus/schema");
  const { RedisDriver } = await import("@colyseus/redis-driver");
  const { RedisPresence } = await import("@colyseus/redis-presence");
  const { z } = await import("zod");

  const port = Number(process.env.PROBE_PORT);
  if (!port) { throw new Error("--server 模式必须提供 PROBE_PORT"); }

  const ProbeState = schema({ createdAt: "number" });
  class ProbeRoom extends Room {
    maxClients = 4;
    state = new ProbeState();
    onCreate(): void { this.state.createdAt = Date.now(); }
  }

  // 编排进程用这些 HTTP 端点观测/驱动 matchMaker（走 0.17 的 better-call 路由，与 src/routes 同款）
  const routes = createRouter({
    whoami: createEndpoint("/probe/whoami", { method: "GET" }, async () => {
      return { processId: matchMaker.processId, port };
    }),
    // 跨进程房间列表：直接问 driver（RedisDriver 读共享 hash `roomcaches`）
    rooms: createEndpoint("/probe/rooms", { method: "GET" }, async () => {
      const rooms = await matchMaker.query({});
      return {
        rooms: rooms.map((r) => ({
          roomId: r.roomId, processId: r.processId, name: r.name,
          clients: r.clients, locked: r.locked, publicAddress: r.publicAddress,
        })),
      };
    }),
    // 进程统计：presence hash `roomcount`（selectProcessIdToCreateRoom 默认实现的数据源）
    stats: createEndpoint("/probe/stats", { method: "GET" }, async () => {
      return { stats: await matchMaker.stats.fetchAll() };
    }),
    // 房间实例是否真的活在本进程内存里（区别于 driver 缓存，这是「房在哪」的权威判据）
    hasLocal: createEndpoint("/probe/hasLocal", {
      method: "POST", body: z.object({ roomId: z.string() }),
    }, async (ctx) => {
      return { local: matchMaker.getLocalRoomById(ctx.body.roomId) !== undefined };
    }),
    // 服务端侧建房（可带 targetProcessId 定向）；返回 seat reservation 或错误
    create: createEndpoint("/probe/create", {
      method: "POST", body: z.object({ roomName: z.string(), targetProcessId: z.string().optional() }),
    }, async (ctx) => {
      try {
        const r = await matchMaker.create(ctx.body.roomName, { targetProcessId: ctx.body.targetProcessId });
        return { ok: true as const, reservation: r };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    }),
    // joinById：对死进程的房触发 ipc_timeout → 健康检查 → 清理（测 (c) 的驱动点）
    joinById: createEndpoint("/probe/joinById", {
      method: "POST", body: z.object({ roomId: z.string() }),
    }, async (ctx) => {
      try {
        const r = await matchMaker.joinById(ctx.body.roomId, {});
        return { ok: true as const, reservation: r };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    }),
  });

  const server = defineServer({
    rooms: { [ROOM]: defineRoom(ProbeRoom) },
    routes,
    greet: false,
    presence: new RedisPresence(REDIS_URL),
    driver: new RedisDriver(REDIS_URL),
    // 各进程报自己的地址：seat reservation 会带上它，客户端据此直连目标进程（跨进程匹配的关键）
    publicAddress: `127.0.0.1:${port}`,
    // 定向建房核心：clientOptions 带 targetProcessId 就用它；否则本进程建（压掉默认「最少房均衡」，让断言确定）
    selectProcessIdToCreateRoom: async (_roomName, clientOptions) => {
      const target = (clientOptions as { targetProcessId?: string } | undefined)?.targetProcessId;
      return target || matchMaker.processId;
    },
  });

  await server.listen(port);
  // 编排进程靠这行拿 processId（processId 由 matchMaker.setup 内部 generateId()，外部不可指定）
  console.log(`PROBE_READY ${matchMaker.processId}`);
}

// ═══════════════════════════ 编排模式 ═══════════════════════════

interface Child { proc: ChildProcess; processId: string; port: number; tag: string }

let failed = false;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { failed = true; }
};

/** spawn 一个 --server 子进程，等 PROBE_READY 行拿 processId。 */
function spawnServer(port: number, tag: string): Promise<Child> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ["--import", "tsx", SELF, "--server"], {
      cwd: SERVER_DIR,
      env: { ...process.env, PROBE_PORT: String(port), PROBE_REDIS_URL: REDIS_URL },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => reject(new Error(`节点 ${tag}(:${port}) 15s 未就绪`)), 15_000);
    let buf = "";
    proc.stdout!.on("data", (d: Buffer) => {
      buf += d.toString();
      const m = /PROBE_READY (\S+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        resolve({ proc, processId: m[1], port, tag });
      }
    });
    proc.stderr!.on("data", (d: Buffer) => process.stderr.write(`[${tag}] ${d.toString()}`));
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`节点 ${tag} 提前退出 code=${String(code)}`));
    });
  });
}

/** stdout 是管道时 process.exit 会截断未落盘的写入——先排水再退。 */
function flushExit(code: number): never {
  process.stdout.write("", () => process.exit(code));
  return undefined as never;
}

const url = (c: Child, path: string): string => `http://127.0.0.1:${c.port}${path}`;

async function get<T>(c: Child, path: string): Promise<T> {
  const res = await fetch(url(c, path));
  return (await res.json()) as T;
}
async function post<T>(c: Child, path: string, body: unknown): Promise<T> {
  const res = await fetch(url(c, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

interface RoomRow { roomId: string; processId: string; name: string; clients: number; locked: boolean }
interface CreateRes { ok: boolean; reservation?: { roomId: string; processId: string; publicAddress?: string }; error?: string }

/** 清空探针 db（db 9）里所有 key。roomcaches/roomcount 是固定名，只能靠独立 db 隔离。 */
async function cleanProbeDb(): Promise<number> {
  const { default: Redis } = await import("ioredis");
  const r = new Redis(REDIS_URL);
  let cursor = "0";
  let n = 0;
  do {
    const [next, keys] = await r.scan(cursor, "COUNT", 500);
    cursor = next;
    if (keys.length > 0) { n += await r.unlink(...keys); }
  } while (cursor !== "0");
  await r.quit();
  return n;
}

/** 等子进程退出（graceful 用 SIGTERM，超时兜底 SIGKILL）。
 *  ⚠ 被信号杀掉的子进程 exitCode 恒为 null、signalCode 才有值——两个都要查，否则等一个永不再来的 exit 事件。 */
function stop(c: Child, signal: NodeJS.Signals): Promise<void> {
  return new Promise((resolve) => {
    if (c.proc.exitCode !== null || c.proc.signalCode !== null) { resolve(); return; }
    const killTimer = setTimeout(() => c.proc.kill("SIGKILL"), 8000);
    c.proc.once("exit", () => { clearTimeout(killTimer); resolve(); });
    c.proc.kill(signal);
  });
}

async function orchestrate(): Promise<void> {
  const { Client } = await import("@colyseus/sdk");
  const leftoverBefore = await cleanProbeDb(); // 上次异常退出的残留
  if (leftoverBefore > 0) { console.log(`（清理上次残留 key ${leftoverBefore} 个）`); }

  console.log("—— 启动双节点（RedisDriver + RedisPresence @ %s）——", REDIS_URL);
  const [A, B] = await Promise.all([spawnServer(PORT_A, "A"), spawnServer(PORT_B, "B")]);
  // 断言前先让双方的 stats.persist（1s 节流）落盘
  await new Promise((r) => setTimeout(r, 1200));
  console.log(`节点 A pid=${A.processId} :${A.port} / 节点 B pid=${B.processId} :${B.port}`);
  check("两进程 processId 互异", A.processId !== B.processId);

  let clientRoom1: { leave(consented?: boolean): Promise<number> } | null = null;

  try {
    // ── (a) 跨进程房间列表 + 匹配 ──
    const created = await post<CreateRes>(A, "/probe/create", { roomName: ROOM });
    check("(a) A 本地建房成功", created.ok && created.reservation?.processId === A.processId,
      created.error ?? created.reservation?.roomId);
    const roomOnA = created.reservation!.roomId;

    const seenFromB = await get<{ rooms: RoomRow[] }>(B, "/probe/rooms");
    const row = seenFromB.rooms.find((r) => r.roomId === roomOnA);
    check("(a) B 进程列表可见 A 的房（RedisDriver 共享 roomcaches）",
      row !== undefined && row.processId === A.processId, JSON.stringify(row ?? null));

    const statsFromB = await get<{ stats: { processId: string }[] }>(B, "/probe/stats");
    const pids = statsFromB.stats.map((s) => s.processId);
    check("(a) stats.fetchAll 双进程齐（RedisPresence 共享 roomcount）",
      pids.includes(A.processId) && pids.includes(B.processId), pids.join(","));

    // 真客户端从 B 的 matchmake 入口 joinOrCreate → 应命中 A 上已有的房（而非在 B 新建）
    const clientViaB = new Client(`http://127.0.0.1:${PORT_B}`);
    const room1 = await clientViaB.joinOrCreate(ROOM, {});
    clientRoom1 = room1;
    check("(a) 经 B 匹配命中 A 的房（跨进程 seat reservation + 直连 publicAddress）",
      room1.roomId === roomOnA, `roomId=${room1.roomId}`);
    const onA = await post<{ local: boolean }>(A, "/probe/hasLocal", { roomId: room1.roomId });
    check("(a) 房间实例确在 A 进程内存", onA.local);

    // ── (b) 定向建房：客户端经 A 的 matchmake API，房间落在 B ──
    const clientViaA = new Client(`http://127.0.0.1:${PORT_A}`);
    const room2 = await clientViaA.create(ROOM, { targetProcessId: B.processId });
    room2.onError(() => { /* 后续 kill B 时的连接错误，吞掉 */ });
    room2.onLeave(() => { /* 同上 */ });
    const localB = await post<{ local: boolean }>(B, "/probe/hasLocal", { roomId: room2.roomId });
    const localA = await post<{ local: boolean }>(A, "/probe/hasLocal", { roomId: room2.roomId });
    check("(b) 经 A 定向 targetProcessId=B → 房间实例落在 B", localB.local && !localA.local,
      `roomId=${room2.roomId} B.local=${String(localB.local)} A.local=${String(localA.local)}`);
    const roomsAfterB = await get<{ rooms: RoomRow[] }>(A, "/probe/rooms");
    const row2 = roomsAfterB.rooms.find((r) => r.roomId === room2.roomId);
    check("(b) driver 缓存记录 processId=B 且客户端已入座", row2?.processId === B.processId && row2.clients === 1,
      JSON.stringify(row2 ?? null));

    // ── (c) kill -9 节点 B → 残留与清理 ──
    console.log("—— kill -9 节点 B ——");
    await stop(B, "SIGKILL");
    await new Promise((r) => setTimeout(r, 500));

    const staleRooms = await get<{ rooms: RoomRow[] }>(A, "/probe/rooms");
    const staleRow = staleRooms.rooms.find((r) => r.roomId === room2.roomId);
    check("(c) kill -9 后 B 的房仍残留在 roomcaches（预期：无进程主动清）", staleRow !== undefined);

    // 触发点：对死进程的房 joinById → _reserveSeat IPC 2s 超时 → healthCheckProcessId(B) 再 2s 超时
    //        → excludeProcess + driver.cleanup(B)（MatchMaker.ts L830-857 / L975-1020 已核对）
    const t0 = Date.now();
    const joinDead = await post<CreateRes>(A, "/probe/joinById", { roomId: room2.roomId });
    const elapsed = Date.now() - t0;
    check("(c) joinById 死进程的房 → 拒绝（SeatReservationError）", !joinDead.ok,
      `${joinDead.error ?? ""}（耗时 ${elapsed}ms，含 2s IPC 超时 + 2s 健康检查超时）`);

    const cleanedRooms = await get<{ rooms: RoomRow[] }>(A, "/probe/rooms");
    check("(c) 健康检查后 B 的房已从 roomcaches 清除",
      cleanedRooms.rooms.every((r) => r.processId !== B.processId));
    const cleanedStats = await get<{ stats: { processId: string }[] }>(A, "/probe/stats");
    check("(c) B 已从 roomcount 剔除", cleanedStats.stats.every((s) => s.processId !== B.processId),
      cleanedStats.stats.map((s) => s.processId).join(","));
  } finally {
    // ── 收尾：客户端离房 → A 优雅退出（会自清 roomcaches/roomcount）→ 清空探针 db ──
    try { await clientRoom1?.leave(); } catch { /* 已断开则忽略 */ }
    await stop(A, "SIGTERM");
    await stop(B, "SIGKILL"); // 通常已死于 (c)，stop 对已死进程直接返回
    const leftover = await cleanProbeDb();
    console.log(`—— 清理完成：探针 db 残留 key ${leftover} 个已 UNLINK ——`);
  }

  if (failed) {
    console.error("—— 探针存在失败项 ——");
    flushExit(1);
  }
  console.log("—— Colyseus 0.17 定向建房 + Redis 驱动探针全部通过 ——");
  flushExit(0); // SDK 的 ws 连接可能残留引用，显式退出
}

// ═══════════════════════════ 入口 ═══════════════════════════

if (process.argv.includes("--server")) {
  runServer().catch((e) => { console.error("❌ 子节点启动失败", e); process.exit(1); });
} else {
  // 编排整体兜底超时，防止子进程异常时挂死 CI
  setTimeout(() => { console.error("❌ 探针 120s 超时"); process.exit(1); }, 120_000).unref();
  orchestrate().catch((e) => { console.error("❌ 探针失败", e); flushExit(1); });
}
