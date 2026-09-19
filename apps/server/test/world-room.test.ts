/**
 * MMO MF4-B6 WorldRoom 传输壳（docs/MMO.md §4.5 / §4.6 / §5.4 MF4；docs/MMO-PLAN.md MF4-B6）：无 Colyseus 传输、假时钟、manualTick，
 * 注入假控制面（MySQL CAS 语义）/ 假租约 / 假目录 / 假 ticket 端口，用真 worldFixture（生成 world root + 生成 wire token）驱动：
 *  - 建房：目录 → 租约 → 权威 CAS → recover → active；租约被持有 / 权威 CAS 输 ⇒ WorldNotAuthoritative 且释放租约；信封 / mode / profile 闸；
 *  - 准入固定时序 ①–⑩ 各自错误码；⑧ 之后拒绝归还控制权；同 persona 两处 join 只一个控制权（顶号：旧会话 lost-control + Replaced 关闭码）；
 *  - C2S 经 catch-all → dispatcher → enqueue → 下一固定步 onStep；出站按会话经 S2CPorts；他 mode / 陌生 / 畸形消息 BadRequest；
 *  - 租约失效 ⇒ Draining（拒准入 / 拒命令 / 仍推进）⇒ 宽限后 Offline（强制检查点 + 全员 drained + WITH_ERROR + 归还控制权 + 释放租约 + state offline + dispose）；
 *  - onLeave：主动离开立即归还控制权；非主动进宽限（座位保留、出站暂停），重连归位，到期清理；
 *  - WorldProfile / RoomProfile 对 world 形态的分工。
 * 变异验证：onJoin 删 ⑤ 的 `owner.userId !== auth.userId` → 「非本账号 persona」转红；删 ⑨ 的顶号离座 → 「旧会话被踢」转红；
 * drain 不调 runtime.drain → 「Draining 拒新准入」转红；finalizeOffline 不 releaseLease → 「释放租约」转红；
 * onJoin 拒绝路径不归还控制权 → 「mode 拒 ⇒ 归还控制权」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S, ErrorCode, ForceLogoutReason, GAMEPLAY_CATALOG, KICK_CLOSE_CODE, S2C, WORLD_ROOM_PROTOCOL_VERSION, WorldPhase,
    type IWorldRoomJoinOptions,
} from "@game/shared";
import { ControlConflictError, PersonaNotFoundError, WorldNotAuthoritativeError } from "../src/core/errors";
import type { PersonaOwner, WorldInstanceRow, WorldInstanceState } from "../src/rooms/core/control";
import { assertRoomProfilesConfigured, resolveRoomProfile } from "../src/rooms/core/RoomProfile";
import type { WorldDirectoryPort } from "../src/rooms/core/WorldDirectory";
import { WORLD_PROFILE_ID, assertWorldProfilesConfigured, resolveWorldProfile, type WorldTicketClaim, type WorldTicketPort } from "../src/rooms/core/WorldProfile";
import type { WorldCheckpoint } from "../src/rooms/WorldMode";
import {
    WORLD_DRAINED_CLOSE_CODE, WORLD_LOST_CONTROL_CLOSE_CODE, WorldRoom,
    type WorldControlPort, type WorldLeaseHandle, type WorldLeasePort, type WorldRoomAuth, type WorldRoomRuntimeOptions, type WorldRoomTimers,
} from "../src/rooms/WorldRoom";
import type { WorldManifestConfig } from "../tools/gameplay-codegen/manifestSchema";
import { WORLD_FIXTURE_MODE_ID, createWorldFixtureMode, type WorldFixtureMode, type WorldFixtureModeOptions } from "./fixtures/worldFixtureMode";

// ── 假控制面（MySQL CAS 语义）──────────────────────────────────────────────────

interface FakeInstance { authorityEpoch: number; holder: string; state: WorldInstanceState }
interface FakePersona { userId: string; status: number; controlEpoch: number; worldAddress: string | null }

export class FakeControl implements WorldControlPort {
    readonly instances = new Map<string, FakeInstance>();
    readonly personas = new Map<string, FakePersona>();
    readonly log: string[] = [];
    /** 读归属前的闸（模拟并发 / 阻塞）。 */
    gate: Promise<void> | null = null;
    /** CAS 之前的钩子（模拟别处抢先抬高 epoch）。 */
    beforeAcquireControl: ((personaId: string) => void) | null = null;

    seedPersona(personaId: string, userId: string, status = 0): void {
        this.personas.set(personaId, { userId, status, controlEpoch: 0, worldAddress: null });
    }
    instance(instanceId: string): FakeInstance {
        let row = this.instances.get(instanceId);
        if (!row) { row = { authorityEpoch: 0, holder: "", state: "offline" }; this.instances.set(instanceId, row); }
        return row;
    }
    async acquireAuthority(_sId: number, instanceId: string, holder: string, expectedEpoch: number): Promise<number> {
        const row = this.instance(instanceId);
        if (row.authorityEpoch !== expectedEpoch) throw new WorldNotAuthoritativeError(instanceId, expectedEpoch, row.authorityEpoch);
        row.authorityEpoch += 1; row.holder = holder; row.state = "recovering";
        this.log.push(`authority:${instanceId}:${row.authorityEpoch}`);
        return row.authorityEpoch;
    }
    async setInstanceState(_sId: number, instanceId: string, authorityEpoch: number, state: WorldInstanceState): Promise<void> {
        const row = this.instance(instanceId);
        if (row.authorityEpoch !== authorityEpoch) throw new WorldNotAuthoritativeError(instanceId, authorityEpoch, row.authorityEpoch);
        row.state = state;
        this.log.push(`state:${instanceId}:${state}`);
    }
    async readPersonaOwner(_sId: number, personaId: string): Promise<PersonaOwner | null> {
        if (this.gate) await this.gate;
        const persona = this.personas.get(personaId);
        return persona ? { ...persona } : null;
    }
    async acquireControl(_sId: number, personaId: string, worldAddress: string, expectedEpoch: number): Promise<number> {
        this.beforeAcquireControl?.(personaId);
        const persona = this.personas.get(personaId);
        if (!persona) throw new PersonaNotFoundError(personaId);
        if (persona.controlEpoch !== expectedEpoch) throw new ControlConflictError(personaId, expectedEpoch, persona.controlEpoch);
        persona.controlEpoch += 1; persona.worldAddress = worldAddress;
        this.log.push(`control:${personaId}:${persona.controlEpoch}`);
        return persona.controlEpoch;
    }
    async releaseControl(_sId: number, personaId: string, controlEpoch: number): Promise<boolean> {
        const persona = this.personas.get(personaId);
        if (!persona || persona.controlEpoch !== controlEpoch) { this.log.push(`release-miss:${personaId}:${controlEpoch}`); return false; }
        persona.worldAddress = null;
        this.log.push(`release:${personaId}:${controlEpoch}`);
        return true;
    }
}

export class FakeLeaseHandle implements WorldLeaseHandle {
    onLost: ((reason: "lost" | "expired") => void) | null = null;
    started = false;
    stopped = false;
    released = false;
    constructor(private readonly owner: FakeLeases, readonly instanceId: string, readonly holder: string, readonly fence: number) {}
    get value(): string { return `${this.holder}:${this.fence}`; }
    start(onLost: (reason: "lost" | "expired") => void): void { this.onLost = onLost; this.started = true; }
    stop(): void { this.stopped = true; }
    async release(): Promise<boolean> {
        this.stopped = true;
        if (this.released) return false;
        this.released = true;
        if (this.owner.held.get(this.instanceId) === this) this.owner.held.delete(this.instanceId);
        this.owner.events.push(`lease-release:${this.instanceId}`);
        return true;
    }
    lose(reason: "lost" | "expired" = "lost"): void {
        this.owner.held.delete(this.instanceId);
        this.onLost?.(reason);
    }
}

export class FakeLeases implements WorldLeasePort {
    readonly held = new Map<string, FakeLeaseHandle>();
    fence = 0;
    /** 与控制面共用一条事件日志（harness 传入 control.log），可断言释放租约与写 state 的先后。 */
    constructor(readonly events: string[] = []) {}
    async acquire(_sId: number, instanceId: string, holder: string): Promise<WorldLeaseHandle | null> {
        if (this.held.has(instanceId)) return null;
        this.fence += 1;
        const handle = new FakeLeaseHandle(this, instanceId, holder, this.fence);
        this.held.set(instanceId, handle);
        return handle;
    }
}

export class FakeDirectory implements WorldDirectoryPort {
    /** 一次性返回陈旧 epoch（模拟读行与 CAS 之间被别的节点抬高）。 */
    staleEpochOnce = false;
    constructor(private readonly control: FakeControl) {}
    async resolve(sId: number, mapId: string, line = 0): Promise<WorldInstanceRow> {
        const instanceId = `wi_${mapId}_${line}`;
        const row = this.control.instance(instanceId);
        let authorityEpoch = row.authorityEpoch;
        if (this.staleEpochOnce) { this.staleEpochOnce = false; authorityEpoch = Math.max(0, authorityEpoch - 1); }
        void sId;
        return { instanceId, mapId, line, authorityEpoch, holder: row.holder, state: row.state, checkpointRev: 0, writeSeq: 0 };
    }
    forget(): void { /* 无缓存 */ }
}

export class FakeTimers implements WorldRoomTimers {
    private next = 1;
    readonly pending = new Map<number, () => void>();
    set(fn: () => void, _ms: number): unknown { const id = this.next++; this.pending.set(id, fn); return id; }
    clear(handle: unknown): void { this.pending.delete(handle as number); }
    fire(): number {
        const batch = [...this.pending.entries()];
        this.pending.clear();
        for (const [, fn] of batch) fn();
        return batch.length;
    }
}

export interface FakeClient {
    sessionId: string;
    auth: WorldRoomAuth | undefined;
    sent: Array<[string, unknown]>;
    closed: number | null;
    send(type: string, payload: unknown): void;
    leave(code?: number): void;
}

export const TICKET_SHA = "a".repeat(64);

export function fakeClient(sessionId: string, personaId: string, userId = `u-${personaId}`, overrides: Partial<WorldRoomAuth> = {}): FakeClient {
    return {
        sessionId,
        auth: {
            userId, sId: 0, mode: WORLD_FIXTURE_MODE_ID, profile: WORLD_PROFILE_ID, mapId: "m1", line: null, personaId,
            ticketSha256: TICKET_SHA, resumeSeq: null, ...overrides,
        },
        sent: [],
        closed: null,
        send(type, payload) { this.sent.push([type, payload]); },
        leave(code) { this.closed = code ?? -1; },
    };
}

export const okTickets: WorldTicketPort = { verify: async () => "ok" };

export interface Harness {
    readonly room: WorldRoom;
    readonly mode: WorldFixtureMode;
    readonly control: FakeControl;
    readonly leases: FakeLeases;
    readonly directory: FakeDirectory;
    readonly timers: FakeTimers;
    readonly checkpoints: Array<{ checkpoint: WorldCheckpoint; reason: string }>;
    readonly clock: { now: number };
}

export function harness(options: {
    world?: Partial<WorldManifestConfig>; capacity?: number; control?: FakeControl; leases?: FakeLeases; tickets?: WorldTicketPort;
    holder?: string; drainGraceMs?: number; modeOptions?: WorldFixtureModeOptions; room?: Partial<WorldRoomRuntimeOptions>;
} = {}): Harness {
    const control = options.control ?? new FakeControl();
    const leases = options.leases ?? new FakeLeases(control.log);
    const directory = new FakeDirectory(control);
    const timers = new FakeTimers();
    const checkpoints: Array<{ checkpoint: WorldCheckpoint; reason: string }> = [];
    const clock = { now: 1_000 };
    const mode = createWorldFixtureMode({ capacity: options.capacity ?? 2, ...(options.modeOptions ?? {}) });
    const room = new WorldRoom({
        mode,
        world: { emptyPolicy: "sleep", emptyAfterMs: 1_000, checkpointMs: 500, ...(options.world ?? {}) },
        seed: 7, fixedStepMs: 50, clock: () => clock.now,
        control, lease: leases, directory, tickets: options.tickets ?? okTickets,
        holder: options.holder ?? "node-a", drainGraceMs: options.drainGraceMs ?? 100, timers,
        checkpointSink: (checkpoint, reason) => { checkpoints.push({ checkpoint, reason }); },
        manualTick: true,
        ...(options.room ?? {}),
    });
    return { room, mode, control, leases, directory, timers, checkpoints, clock };
}

export const joinOptions = (overrides: Partial<IWorldRoomJoinOptions> = {}): IWorldRoomJoinOptions => ({
    v: WORLD_ROOM_PROTOCOL_VERSION, sId: 0, mode: WORLD_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion,
    profile: WORLD_PROFILE_ID, mapId: "m1", personaId: "p_creator_00000000", ticket: "t".repeat(24), ...overrides,
});

export const assertCode = (code: number) => (error: unknown): boolean => error instanceof Error && error.message.includes(String(code));

export const join = (room: WorldRoom, client: FakeClient): Promise<void> => room.onJoin(client as never, {});

export function dispatch(room: WorldRoom, type: unknown, client: FakeClient, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: unknown, p: unknown) => void })._(client, type, payload);
}

const errorsOf = (client: FakeClient): number[] => client.sent.filter(([type]) => type === S2C.Error).map(([, payload]) => (payload as { code: number }).code);

const P_ALICE = "p_alice_0000000001";
const P_BOB = "p_bob_00000000001";
const P_CAROL = "p_carol_0000000001";

async function seatedRoom(options: Parameters<typeof harness>[0] = {}): Promise<Harness & { alice: FakeClient }> {
    const h = harness(options);
    h.control.seedPersona(P_ALICE, "u-alice");
    h.control.seedPersona(P_BOB, "u-bob");
    h.control.seedPersona(P_CAROL, "u-carol");
    await h.room.onCreate(joinOptions());
    const alice = fakeClient("sa", P_ALICE, "u-alice");
    await join(h.room, alice);
    return { ...h, alice };
}

test("建房：目录 → 租约 → 权威 CAS → recover → active；租约被持有 / 权威 CAS 输 ⇒ WorldNotAuthoritative 并释放租约；信封 / mode / profile / modeVersion 闸", async () => {
    const h = harness();
    await h.room.onCreate(joinOptions());
    assert.equal(h.room.phase, WorldPhase.Active);
    assert.deepEqual(h.room.address, { sId: 0, mapId: "m1", line: 0, instanceId: "wi_m1_0", authorityEpoch: 1 });
    assert.deepEqual([h.room.state.phase, h.room.state.instanceId, h.room.state.mapId, h.room.state.line, h.room.state.authorityEpoch],
        [WorldPhase.Active, "wi_m1_0", "m1", 0, 1], "生成 root 的生命周期字段由 runtime 写");
    assert.equal((h.room.state as { entityCount?: number }).entityCount, 4, "静态体已撒");
    assert.deepEqual(h.control.instance("wi_m1_0"), { authorityEpoch: 1, holder: "node-a", state: "active" });
    assert.equal(h.leases.held.get("wi_m1_0")?.started, true, "续租循环已起");
    assert.equal(h.room.maxClients, 2, "容量按会话表 = mode.capacity");
    assert.deepEqual(h.room.worldProfile, { id: "world", mode: WORLD_FIXTURE_MODE_ID, accessPolicy: { kind: "world-ticket" } });
    assert.deepEqual(h.mode.__probe.log, ["init:m1#0:false"]);
    await assert.rejects(h.room.onCreate(joinOptions()), assertCode(ErrorCode.BadRequest), "重复 onCreate");

    // 租约被持有（另一节点已在跑）⇒ 拒建房，权威 epoch 不动
    const other = harness({ leases: h.leases, control: h.control, holder: "node-b" });
    await assert.rejects(other.room.onCreate(joinOptions()), assertCode(ErrorCode.WorldNotAuthoritative));
    assert.equal(other.room.phase, null);
    assert.equal(h.control.instance("wi_m1_0").authorityEpoch, 1);

    // 权威 CAS 输（读行与 CAS 之间 epoch 被抬高）⇒ 释放刚取的租约再拒
    const lost = harness();
    lost.control.instance("wi_m1_0").authorityEpoch = 3;
    lost.directory.staleEpochOnce = true;
    await assert.rejects(lost.room.onCreate(joinOptions()), assertCode(ErrorCode.WorldNotAuthoritative));
    assert.equal(lost.leases.held.size, 0, "CAS 输 ⇒ 租约已释放");
    assert.equal(lost.room.hasLease, false);

    // 信封 / mode / profile / modeVersion（与 onAuth 同口径）
    await assert.rejects(harness().room.onCreate({ ...joinOptions(), v: WORLD_ROOM_PROTOCOL_VERSION + 1 }), assertCode(ErrorCode.ProtocolMismatch));
    await assert.rejects(harness().room.onCreate(joinOptions({ mode: "viewFixture" })), assertCode(ErrorCode.BadRequest), "注入 mode 与请求不符");
    await assert.rejects(harness().room.onCreate(joinOptions({ profile: "default" })), assertCode(ErrorCode.BadRequest), "profile 恒 world");
    await assert.rejects(harness().room.onCreate(joinOptions({ modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion + 1 })), assertCode(ErrorCode.ProtocolMismatch));
    await assert.rejects(harness().room.onCreate(joinOptions({ sId: 70_000 } as never)), assertCode(ErrorCode.WrongServer));
    await assert.rejects(harness().room.onCreate({ ...joinOptions(), bogus: 1 } as never), assertCode(ErrorCode.BadRequest), "exact keys");
});

test("准入固定时序：权威值 / 容量 / persona 归属 / ticket / 控制权 CAS / mode 拒 → 各错误码；⑧ 之后拒绝归还控制权；落座 + onEnter；client.auth ⛔ 明文 ticket", async () => {
    const h = harness({ capacity: 2 });
    h.control.seedPersona(P_ALICE, "u-alice");
    h.control.seedPersona(P_BOB, "u-bob");
    h.control.seedPersona(P_CAROL, "u-carol");
    h.control.seedPersona("p_inactive_000000001", "u-inactive", 1);
    await h.room.onCreate(joinOptions());
    // ② 权威值 vs 房间常量
    await assert.rejects(join(h.room, { ...fakeClient("s0", P_ALICE, "u-alice"), auth: undefined }), assertCode(ErrorCode.WrongServer));
    await assert.rejects(join(h.room, fakeClient("s0", P_ALICE, "u-alice", { sId: 1 })), assertCode(ErrorCode.WrongServer));
    await assert.rejects(join(h.room, fakeClient("s0", P_ALICE, "u-alice", { mode: "viewFixture" })), assertCode(ErrorCode.BadRequest));
    await assert.rejects(join(h.room, fakeClient("s0", P_ALICE, "u-alice", { profile: "dropIn" })), assertCode(ErrorCode.BadRequest));
    await assert.rejects(join(h.room, fakeClient("s0", P_ALICE, "u-alice", { mapId: "m2" })), assertCode(ErrorCode.BadRequest), "joinById 串图");
    await assert.rejects(join(h.room, fakeClient("s0", P_ALICE, "u-alice", { line: 3 })), assertCode(ErrorCode.BadRequest), "joinById 串线");
    await assert.rejects(join(h.room, fakeClient("s0", P_ALICE, "u-alice", { ticketSha256: "zz" })), assertCode(ErrorCode.BadRequest), "sha256 形状");
    // ⑤ 归属（存储真源）
    await assert.rejects(join(h.room, fakeClient("s1", "p_ghost_0000000001", "u-ghost")), assertCode(ErrorCode.PersonaNotFound));
    await assert.rejects(join(h.room, fakeClient("s2", P_ALICE, "u-mallory")), assertCode(ErrorCode.BadRequest), "非本账号 persona");
    await assert.rejects(join(h.room, fakeClient("s3", "p_inactive_000000001", "u-inactive")), assertCode(ErrorCode.BadRequest), "inactive persona");
    assert.equal(h.control.log.filter((entry) => entry.startsWith("control:")).length, 0, "⑤ 拒绝发生在控制权 CAS 之前");
    // ⑥ ticket 端口（拿到的是 sha256 + 分线声明）
    const claims: WorldTicketClaim[] = [];
    const strict = harness({ tickets: { verify: async (claim) => { claims.push(claim); return claim.ticketSha256 === "b".repeat(64) ? "ok" : "invalid"; } } });
    strict.control.seedPersona(P_ALICE, "u-alice");
    await strict.room.onCreate(joinOptions());
    await assert.rejects(join(strict.room, fakeClient("s4", P_ALICE, "u-alice")), assertCode(ErrorCode.WorldTicketInvalid));
    assert.deepEqual(claims, [{ sId: 0, userId: "u-alice", personaId: P_ALICE, mapId: "m1", line: 0, ticketSha256: TICKET_SHA }]);
    assert.equal(strict.control.log.filter((entry) => entry.startsWith("control:")).length, 0, "⑥ 拒绝发生在控制权 CAS 之前");
    await join(strict.room, fakeClient("s5", P_ALICE, "u-alice", { ticketSha256: "b".repeat(64) }));
    assert.equal(strict.room.seatedCount, 1);
    // ⑧ 控制权 CAS 输：读到 epoch 0，CAS 前被别处抬到 1
    h.control.beforeAcquireControl = (personaId) => { if (personaId === P_CAROL) { h.control.personas.get(P_CAROL)!.controlEpoch = 1; h.control.beforeAcquireControl = null; } };
    await assert.rejects(join(h.room, fakeClient("s6", P_CAROL, "u-carol")), assertCode(ErrorCode.ControlConflict));
    assert.equal(h.room.seatedCount, 0);
    // 成功落座
    const alice = fakeClient("sa", P_ALICE, "u-alice");
    await join(h.room, alice);
    assert.deepEqual(h.room.seatedSessionIds(), ["sa"]);
    assert.ok(h.control.log.includes(`control:${P_ALICE}:1`), "控制权 CAS 赢");
    assert.equal(h.control.personas.get(P_ALICE)?.worldAddress, "s0/m1/0");
    assert.ok(!("ticket" in (alice.auth as object)), "auth 只有 sha256");
    assert.ok(h.mode.__probe.log.includes(`admit:${P_ALICE}`) && h.mode.__probe.log.includes("enter:sa"));
    assert.equal(h.mode.__probe.moverOf("sa")?.id, `mover-${P_ALICE}`);
    assert.equal((h.room.state as { entityCount?: number }).entityCount, 5);
    // ④ 同会话重复
    await assert.rejects(join(h.room, alice), assertCode(ErrorCode.AlreadyInRoom));
    // ③ 容量（2/2 后第三人 RoomFull，⛔ 不碰存储）
    await join(h.room, fakeClient("sb", P_BOB, "u-bob"));
    const controlCalls = h.control.log.length;
    await assert.rejects(join(h.room, fakeClient("sc", P_CAROL, "u-carol")), assertCode(ErrorCode.RoomFull));
    assert.equal(h.control.log.length, controlCalls, "满员拒绝不打存储");
    // ⑩ mode 拒 ⇒ BadRequest 且归还刚拿到的控制权
    const picky = harness({ modeOptions: { admit: (request) => request.personaId !== P_BOB } });
    picky.control.seedPersona(P_BOB, "u-bob");
    await picky.room.onCreate(joinOptions());
    await assert.rejects(join(picky.room, fakeClient("sb", P_BOB, "u-bob")), assertCode(ErrorCode.BadRequest));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(picky.control.log.filter((entry) => entry.includes(P_BOB)), [`control:${P_BOB}:1`, `release:${P_BOB}:1`], "mode 拒 ⇒ 归还控制权");
    assert.equal(picky.control.personas.get(P_BOB)?.worldAddress, null);
});

test("同 persona 两处 join 只一个控制权：新连接 CAS 赢 ⇒ 旧会话 lost-control 离座并以 Replaced 关闭码被踢（旧 epoch ⛔ 归还）；pending 同 persona ⇒ ControlConflict；迟到的 onLeave 幂等", async () => {
    const h = await seatedRoom({ capacity: 3 }); // ③ 容量闸先于 ④ pending 同 persona：留出 pending 占位
    const alice2 = fakeClient("sa2", P_ALICE, "u-alice");
    await join(h.room, alice2);
    assert.deepEqual(h.room.seatedSessionIds(), ["sa2"], "只一个控制");
    assert.equal(h.alice.closed, WORLD_LOST_CONTROL_CLOSE_CODE);
    assert.equal(WORLD_LOST_CONTROL_CLOSE_CODE, KICK_CLOSE_CODE[ForceLogoutReason.Replaced]);
    assert.ok(h.mode.__probe.log.includes("leave:sa:lost-control"));
    assert.equal(h.control.personas.get(P_ALICE)?.controlEpoch, 2);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(h.control.log.filter((entry) => entry.includes(P_ALICE)), [`control:${P_ALICE}:1`, `control:${P_ALICE}:2`], "lost-control 不归还（epoch 已抬高）");
    assert.equal(h.control.personas.get(P_ALICE)?.worldAddress, "s0/m1/0", "新控制者仍在世界里");
    await h.room.onLeave(h.alice as never, WORLD_LOST_CONTROL_CLOSE_CODE);
    assert.deepEqual(h.room.seatedSessionIds(), ["sa2"], "被踢会话迟到的 onLeave 无操作");
    // pending 同 persona：第一个准入卡在读归属，第二个立即 ControlConflict（⛔ 不打存储）
    let open!: () => void;
    h.control.gate = new Promise<void>((resolve) => { open = resolve; });
    const first = join(h.room, fakeClient("sb", P_BOB, "u-bob"));
    await assert.rejects(join(h.room, fakeClient("sb2", P_BOB, "u-bob")), assertCode(ErrorCode.ControlConflict));
    h.control.gate = null;
    open();
    await first;
    assert.deepEqual(h.room.seatedSessionIds(), ["sa2", "sb"]);
});

test("C2S：catch-all → dispatcher → enqueue → 下一固定步 onStep 收有序命令 → pos 回执按会话经 S2CPorts；Ping/Pong 走 core；他 mode / 陌生 / 畸形 / 未在座 ⇒ BadRequest", async () => {
    const h = await seatedRoom();
    const bob = fakeClient("sb", P_BOB, "u-bob");
    await join(h.room, bob);
    dispatch(h.room, C2S.WorldFixtureMove, h.alice, { dirX: 1, dirY: 0, seq: 1 });
    dispatch(h.room, C2S.WorldFixtureMove, bob, { dirX: 0, dirY: -1, seq: 5 });
    assert.equal(h.room.pendingCommands, 2, "入队等下一固定步");
    assert.deepEqual(h.alice.sent, [], "⛔ 不在收到命令时直接出站");
    assert.equal(h.room.advance(50), 1);
    assert.deepEqual(h.alice.sent, [[S2C.WorldFixturePos, { entityId: `mover-${P_ALICE}`, x: 502, y: 500, seq: 1, tick: 1 }]], "服务端常量速度积分后按会话回执");
    assert.deepEqual(bob.sent, [[S2C.WorldFixturePos, { entityId: `mover-${P_BOB}`, x: 500, y: 498, seq: 5, tick: 1 }]]);
    assert.equal(h.room.pendingCommands, 0);
    h.room.advance(50);
    assert.equal(h.alice.sent.length, 2, "持续移动每步回执");
    assert.deepEqual(h.alice.sent[1]![1], { entityId: `mover-${P_ALICE}`, x: 504, y: 500, seq: 1, tick: 2 });
    // core 心跳
    dispatch(h.room, C2S.Ping, h.alice, { clientTime: 5 });
    assert.deepEqual(h.alice.sent.at(-1), [S2C.Pong, { clientTime: 5, serverTime: 1_000 }]);
    // 拒绝路径（全部 BadRequest、⛔ 不入队）
    const before = h.alice.sent.length;
    dispatch(h.room, C2S.WorldFixtureMove, h.alice, { dirX: 2, dirY: 0, seq: 1 });
    dispatch(h.room, C2S.Move, h.alice, { dirX: 1, dirY: 0 });
    dispatch(h.room, "c2s.nope.x", h.alice, {});
    dispatch(h.room, C2S.Chat, h.alice, { text: "hi" });
    dispatch(h.room, C2S.RoomReady, h.alice, { ready: true });
    assert.deepEqual(errorsOf(h.alice).slice(-5), Array(5).fill(ErrorCode.BadRequest));
    assert.equal(h.alice.sent.length, before + 5);
    assert.equal(h.room.pendingCommands, 0);
    const stranger = fakeClient("sz", P_CAROL, "u-carol");
    dispatch(h.room, C2S.WorldFixtureMove, stranger, { dirX: 1, dirY: 0, seq: 1 });
    assert.deepEqual(errorsOf(stranger), [ErrorCode.BadRequest], "未在座：dispatcher 放行后被 enqueue 拒");
});

test("租约失效 ⇒ Draining：拒新准入（WorldDraining）、拒命令、仍推进；宽限后 Offline：强制检查点 + 全员 drained + WITH_ERROR + 归还控制权 + 释放租约 + state offline + dispose", async () => {
    const h = await seatedRoom({ drainGraceMs: 100 });
    h.leases.held.get("wi_m1_0")!.lose("lost");
    assert.equal(h.room.phase, WorldPhase.Draining);
    assert.ok(h.mode.__probe.log.includes("drain:lease-lost"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.control.instance("wi_m1_0").state, "draining");
    await assert.rejects(join(h.room, fakeClient("sb", P_BOB, "u-bob")), assertCode(ErrorCode.WorldDraining), "Draining 拒新准入");
    dispatch(h.room, C2S.WorldFixtureMove, h.alice, { dirX: 1, dirY: 0, seq: 1 });
    assert.equal(h.room.pendingCommands, 0, "Draining 拒命令（dispatcher 的 phase 闸：非 Active ⇒ settle）");
    assert.deepEqual(errorsOf(h.alice), [ErrorCode.BadRequest]);
    assert.equal(h.room.advance(100), 2, "Draining 仍推进");
    assert.equal(h.timers.pending.size, 1, "宽限计时器已挂");
    assert.equal(h.timers.fire(), 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.room.phase, WorldPhase.Offline);
    assert.deepEqual(h.checkpoints.map((entry) => entry.reason), ["forced"], "Offline 前强制检查点");
    assert.equal(h.alice.closed, WORLD_DRAINED_CLOSE_CODE);
    assert.ok(h.mode.__probe.log.includes("leave:sa:drained"));
    assert.ok(h.control.log.includes(`release:${P_ALICE}:1`), "归还控制权");
    assert.equal(h.leases.held.size, 0, "释放租约");
    assert.equal(h.room.hasLease, false);
    assert.equal(h.control.instance("wi_m1_0").state, "offline");
    const releaseAt = h.control.log.indexOf("lease-release:wi_m1_0");
    const offlineAt = h.control.log.indexOf("state:wi_m1_0:offline");
    assert.ok(releaseAt >= 0 && offlineAt > releaseAt, `壳自己在 Offline 收尾释放租约（先于 state offline），⛔ 不靠 dispose 兜底：${h.control.log.join(" → ")}`);
    assert.equal(h.room.isDisposed, true, "dispose");
    assert.equal(h.room.advance(1_000), 0, "Offline 不推进");
    // GM drain 无人在座 ⇒ 立即 Offline；mode.requestDrain（signal）同路径
    const idle = harness();
    await idle.room.onCreate(joinOptions());
    idle.room.drain("gm");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(idle.room.phase, WorldPhase.Offline);
    assert.equal(idle.timers.pending.size, 0);
    const viaMode = await seatedRoom();
    viaMode.room.signal("drain", {});
    assert.equal(viaMode.room.phase, WorldPhase.Draining);
    assert.ok(viaMode.mode.__probe.log.includes("drain:mode:signal"));
    viaMode.room.drain("again");
    assert.equal(viaMode.mode.__probe.log.filter((entry) => entry.startsWith("drain:")).length, 1, "幂等");
});

test("onLeave：主动离开立即离座并归还控制权；非主动断线进宽限（座位保留、出站暂停），重连归位；到期按离开清理", async () => {
    const h = await seatedRoom();
    await h.room.onLeave(h.alice as never, CloseCode.CONSENTED);
    assert.equal(h.room.seatedCount, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(h.control.log.includes(`release:${P_ALICE}:1`));
    assert.equal(h.control.personas.get(P_ALICE)?.worldAddress, null);
    assert.ok(h.mode.__probe.log.includes("leave:sa:left"));
    // 宽限：重连
    const bob = fakeClient("sb", P_BOB, "u-bob");
    await join(h.room, bob);
    let settle!: (reconnected: boolean) => void;
    (h.room as unknown as { allowReconnection: () => Promise<void> }).allowReconnection = () =>
        new Promise<void>((resolve, reject) => { settle = (ok) => (ok ? resolve() : reject(new Error("expired"))); });
    const leaving = h.room.onLeave(bob as never, CloseCode.ABNORMAL_CLOSURE);
    assert.equal(h.room.seatedCount, 1, "宽限内座位保留");
    dispatch(h.room, C2S.WorldFixtureMove, bob, { dirX: 1, dirY: 0, seq: 1 });
    h.room.advance(50);
    assert.deepEqual(bob.sent.filter(([type]) => type === S2C.WorldFixturePos), [], "宽限中出站暂停");
    settle(true);
    await leaving;
    assert.equal(h.room.seatedCount, 1);
    h.room.advance(50);
    assert.equal(bob.sent.filter(([type]) => type === S2C.WorldFixturePos).length, 1, "重连后恢复出站");
    // 宽限到期
    const leaving2 = h.room.onLeave(bob as never, CloseCode.ABNORMAL_CLOSURE);
    settle(false);
    await leaving2;
    assert.equal(h.room.seatedCount, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(h.control.log.includes(`release:${P_BOB}:1`));
});

test("WorldProfile：world 形态只有 profile \"world\"（AccessPolicy world-ticket、无 StartPolicy）；match mode 不得声明 world；RoomProfile 对 world 形态拒绝 / 跳过", () => {
    const profile = resolveWorldProfile(WORLD_FIXTURE_MODE_ID, "world");
    assert.deepEqual(profile, { id: "world", mode: WORLD_FIXTURE_MODE_ID, accessPolicy: { kind: "world-ticket" } });
    assert.ok(!("startPolicy" in profile));
    assert.throws(() => resolveWorldProfile(WORLD_FIXTURE_MODE_ID, "default"), /只有 profile "world"/u);
    assert.throws(() => resolveWorldProfile("snake", "world"), /不是 world 形态/u);
    assert.throws(() => resolveWorldProfile("nope", "world"), /未知 mode/u);
    assert.doesNotThrow(() => assertWorldProfilesConfigured());
    assert.throws(() => assertWorldProfilesConfigured({ a: { kind: "match", profiles: ["default", "world"] } }), /match 形态 mode a 不得声明/u);
    assert.throws(() => assertWorldProfilesConfigured({ b: { kind: "world", profiles: ["world", "default"] } }), /必须恰为 \["world"\]/u);
    assert.throws(() => assertWorldProfilesConfigured({ c: { kind: "world", profiles: ["default"] } }), /必须恰为 \["world"\]/u);
    assert.throws(() => resolveRoomProfile(WORLD_FIXTURE_MODE_ID, "world"), /world 形态/u, "GameRoom 的 profile 表拒绝 world 形态");
    assert.doesNotThrow(() => assertRoomProfilesConfigured(), "全量断言跳过 world 形态");
});
