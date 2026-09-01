/**
 * 私房 owner-ready / invite-code 的服务端用例矩阵（Non-intrusive §6.2–§6.8；
 * 验收表 §10.2/§10.3 中判定方式为「服务端用例」的行全部落在本文件——每条用例头部
 * 注明对应验收行与变异验证；真 Redis 行（Lua CAS / tombstone / SET NX / jti 状态机 /
 * 折叠字节 / 专用速率桶）在 test/int/private-room.test.ts）。
 *
 * fixture gameplay：privateFixture（state.json 声明 ownerReady+inviteRoom fragment，
 * manifest.profiles=["default","private"]）——⛔ 不进生产 mode registry，本文件按注入
 * mode 直构 GameRoom；invite lease / access ticket 走内存假件（注入面
 * GameRoomRuntimeOptions.privateRoom）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S,
    S2C,
    ErrorCode,
    GamePhase,
    GAME_ROOM_PROTOCOL_VERSION,
    RoomControlError,
    type IGameRoomJoinOptions,
} from "@game/shared";
import { GameRoom, type PrivateRoomRuntimeServices } from "../src/rooms/GameRoom";
import type { GameMode } from "../src/rooms/GameMode";
import { resolveRoomProfile, type RoomProfile } from "../src/rooms/core/RoomProfile";
import { PrivateFixturePlayerState, PrivateFixtureState } from "../src/rooms/schema/GameRoomState";
import type {
    InviteCodeService,
    InviteCodeAllocationArgs,
    InviteLeaseHandleArgs,
    InviteRenewResult,
    InviteReleaseResult,
    InviteLease,
} from "../src/core/rooms/invite/InviteCodeReservation";
import type {
    AccessTicketService,
    ClaimCreationArgs,
    ClaimCreationResult,
    ClaimJoinArgs,
    ClaimJoinResult,
} from "../src/core/rooms/invite/AccessTicket";

const FIXTURE_MODE_ID = "privateFixture";
const PRIVATE_PROFILE: RoomProfile = resolveRoomProfile(FIXTURE_MODE_ID, "private");
const OWNER_TICKET = "OWNERCREATIONTICKET_000000000000000000000001";

type SentMessage = readonly [string, unknown];

type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string };
    sent: SentMessage[];
    send: (type: string, payload: unknown) => void;
};

function client(sessionId: string, userId = `u-${sessionId}`): FakeClient {
    const sent: SentMessage[] = [];
    return {
        sessionId,
        auth: { userId, sId: 0, mode: FIXTURE_MODE_ID },
        sent,
        send(type, payload) { sent.push([type, payload]); },
    };
}

/** 私房 fixture mode：无玩法输入，roster min=2/max=4（autoStart=4 但 owner-ready 下不触发）。 */
function createFixtureMode(overrides: Partial<GameMode<PrivateFixtureState, PrivateFixturePlayerState>> = {},
): GameMode<PrivateFixtureState, PrivateFixturePlayerState> {
    return {
        id: FIXTURE_MODE_ID,
        roster: { min: 2, max: 4, autoStart: 4 },
        createPlayer({ sessionId, name }) {
            const player = new PrivateFixturePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        ...overrides,
    };
}

class FakeInviteCodes implements InviteCodeService {
    allocSeq = 0;
    failAllocate = false;
    readonly allocated: InviteCodeAllocationArgs[] = [];
    readonly renewCalls: InviteLeaseHandleArgs[] = [];
    readonly released: Array<InviteLeaseHandleArgs> = [];
    renewQueue: InviteRenewResult[] = [];
    releaseResult: InviteReleaseResult = "ok";

    async allocate(args: InviteCodeAllocationArgs): Promise<InviteLease> {
        if (this.failAllocate) throw new Error("invite infra down");
        this.allocated.push(args);
        this.allocSeq++;
        return {
            code: String(this.allocSeq).padStart(6, "0"),
            leaseToken: `LEASETOKENSECRET_${this.allocSeq}`,
            generation: this.allocSeq,
        };
    }

    async renew(args: InviteLeaseHandleArgs): Promise<InviteRenewResult> {
        this.renewCalls.push(args);
        return this.renewQueue.shift() ?? "renewed";
    }

    async releaseToTombstone(args: InviteLeaseHandleArgs): Promise<InviteReleaseResult> {
        this.released.push(args);
        return this.releaseResult;
    }
}

type JoinTicketRecord = { uid: string; state: "issued" | "pending" | "seated"; session?: string };

class FakeAccessTickets implements AccessTicketService {
    readonly creation = new Map<string, { uid: string; state: "issued" | "claimed" | "seated" }>();
    readonly join = new Map<string, JoinTicketRecord>();
    readonly callLog: string[] = [];
    claimJoinGate: Promise<void> | null = null;
    quotaReleases = 0;

    issueCreation(ticket: string, uid: string): void {
        this.creation.set(ticket, { uid, state: "issued" });
    }

    issueJoin(ticket: string, uid: string): void {
        this.join.set(ticket, { uid, state: "issued" });
    }

    async claimCreation(args: ClaimCreationArgs): Promise<ClaimCreationResult> {
        this.callLog.push("claimCreation");
        const record = this.creation.get(args.ticket);
        if (!record || record.state !== "issued") return { kind: "refused" };
        record.state = "claimed";
        return { kind: "ok", uid: record.uid, modeVersion: 1 };
    }

    async claimJoin(args: ClaimJoinArgs): Promise<ClaimJoinResult> {
        this.callLog.push(`claimJoin:${args.sessionId}`);
        if (this.claimJoinGate) await this.claimJoinGate;
        const record = this.join.get(args.ticket);
        if (!record || record.state !== "issued") return { kind: "refused" };
        record.state = "pending";
        record.session = args.sessionId;
        return { kind: "ok", uid: record.uid };
    }

    async releaseJoin(_sId: number, ticket: string, sessionId: string): Promise<void> {
        this.callLog.push(`releaseJoin:${sessionId}`);
        const record = this.join.get(ticket);
        if (record && record.state === "pending" && record.session === sessionId) {
            record.state = "issued";
            delete record.session;
        }
    }

    async seatJoin(_sId: number, ticket: string, sessionId: string): Promise<void> {
        this.callLog.push(`seatJoin:${sessionId}`);
        const record = this.join.get(ticket);
        if (record && record.state === "pending" && record.session === sessionId) record.state = "seated";
    }

    async seatCreation(_sId: number, ticket: string): Promise<void> {
        this.callLog.push("seatCreation");
        const record = this.creation.get(ticket);
        if (record && record.state === "claimed") record.state = "seated";
    }

    async releaseRoomQuota(): Promise<void> {
        this.quotaReleases++;
    }
}

type Harness = {
    room: GameRoom;
    invites: FakeInviteCodes;
    tickets: FakeAccessTickets;
    now: { value: number };
    broadcasts: SentMessage[];
    disconnects: number[];
    view(): PrivateFixtureState;
    joinOptions(access?: IGameRoomJoinOptions["access"]): IGameRoomJoinOptions;
};

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

const flushMicrotasks = async (rounds = 4): Promise<void> => {
    for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve));
};

async function buildPrivateRoom(options: {
    mode?: GameMode<PrivateFixtureState, PrivateFixturePlayerState>;
    privateRoom?: Partial<PrivateRoomRuntimeServices>;
    startLockTimeoutMs?: number;
    lock?: () => Promise<void>;
} = {}): Promise<Harness> {
    const now = { value: 0 };
    const invites = new FakeInviteCodes();
    const tickets = new FakeAccessTickets();
    tickets.issueCreation(OWNER_TICKET, "u-owner");
    const room = new GameRoom({
        seed: 7,
        clock: () => now.value,
        fixedStepMs: 50,
        mode: options.mode ?? createFixtureMode(),
        profile: PRIVATE_PROFILE,
        privateRoom: {
            inviteCodes: invites,
            accessTickets: tickets,
            ...(options.privateRoom ?? {}),
        },
        ...(options.startLockTimeoutMs === undefined ? {} : { startLockTimeoutMs: options.startLockTimeoutMs }),
    });
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        setPrivate(value: boolean): Promise<void>;
        lock(): Promise<void>;
        broadcast(type: string, payload: unknown): void;
        disconnect(code?: number): Promise<void>;
        roomId: string;
    };
    internals.setSimulationInterval = () => undefined;
    internals.setPrivate = async () => undefined;
    internals.lock = options.lock ?? (async () => undefined);
    internals.roomId = "fixture-room";
    const broadcasts: SentMessage[] = [];
    internals.broadcast = (type, payload) => broadcasts.push([type, payload]);
    const disconnects: number[] = [];
    internals.disconnect = async (code?: number) => { disconnects.push(code ?? 0); };
    const joinOptions = (access?: IGameRoomJoinOptions["access"]): IGameRoomJoinOptions => ({
        v: GAME_ROOM_PROTOCOL_VERSION,
        sId: 0,
        mode: FIXTURE_MODE_ID,
        profile: "private",
        ...(access === undefined ? {} : { access }),
    });
    await room.onCreate(joinOptions({ kind: "create", ticket: OWNER_TICKET }));
    return {
        room,
        invites,
        tickets,
        now,
        broadcasts,
        disconnects,
        view: () => room.state as unknown as PrivateFixtureState,
        joinOptions,
    };
}

async function seatOwner(harness: Harness): Promise<FakeClient> {
    const owner = client("owner", "u-owner");
    await harness.room.onJoin(owner as never, harness.joinOptions({ kind: "create", ticket: OWNER_TICKET }));
    return owner;
}

async function seatJoiner(harness: Harness, sessionId: string): Promise<FakeClient> {
    const ticket = `JOINTICKET_${sessionId}_0000000000000000000000`;
    harness.tickets.issueJoin(ticket, `u-${sessionId}`);
    const joiner = client(sessionId);
    await harness.room.onJoin(joiner as never, harness.joinOptions({ kind: "join", ticket }));
    return joiner;
}

function dispatch(room: GameRoom, type: string, sender: FakeClient, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(sender, type, payload);
}

function setReady(room: GameRoom, sender: FakeClient, ready = true): void {
    dispatch(room, C2S.RoomReady, sender, { ready });
}

function lastRoomError(sender: FakeClient): number | undefined {
    const entry = [...sender.sent].reverse().find(([type]) => type === S2C.RoomError);
    return entry ? (entry[1] as { code: number }).code : undefined;
}

async function startAndSettle(room: GameRoom, owner: FakeClient): Promise<void> {
    dispatch(room, C2S.RoomStart, owner, {});
    const pending = (room as unknown as { startPromise: Promise<boolean> | null }).startPromise;
    if (pending) await pending.catch(() => undefined);
    await flushMicrotasks();
}

// ── §10.3：新玩家默认未 Ready；Ready 只在 Waiting 修改，房主也必须 Ready ─────
// 变异验证：让房主免 Ready（handleRoomStart 跳过 owner 的 ready 检查）→ 本用例转红。
test("私房：入座默认未 Ready；全员（含房主）Ready 才能开局", async () => {
    const harness = await buildPrivateRoom();
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    const view = harness.view();
    assert.equal(view.players.get("owner")?.ready, false, "新玩家默认未 Ready");
    assert.equal(view.players.get("guest-a")?.ready, false);
    assert.equal(view.ownerId, "owner", "creation claim 固定的 expectedOwnerUid 落座即为 owner");

    setReady(harness.room, guest);
    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(lastRoomError(owner), RoomControlError.NotAllReady, "房主未 Ready 也算未全员 Ready");

    setReady(harness.room, owner);
    await startAndSettle(harness.room, owner);
    assert.equal(harness.view().phase, GamePhase.Playing);

    // Ready 只在 Waiting 修改：Playing 后 wirePhaseAllows 拒（s2c.error BadRequest）。
    const before = owner.sent.length;
    setReady(harness.room, owner, false);
    const [type, payload] = owner.sent[before] ?? [];
    assert.equal(type, S2C.Error);
    assert.equal((payload as { code: number }).code, ErrorCode.BadRequest);
    assert.equal(harness.view().players.get("owner")?.ready, true, "Playing 后 Ready 不可改");
});

// ── §10.3：2、3、4 人全部 Ready 均能由房主开局；低于 roster.min 被拒（容量矩阵）──
// 变异验证：把 handleRoomStart 的 min 下界检查去掉 → 单人开局分支转红。
test("私房容量矩阵：2/3/4 人全 Ready 可开局，1 人 BelowMin，第五人 RoomFull", async () => {
    for (const seats of [2, 3, 4]) {
        const harness = await buildPrivateRoom();
        const owner = await seatOwner(harness);
        const members: FakeClient[] = [owner];
        for (let index = 1; index < seats; index++) members.push(await seatJoiner(harness, `guest-${index}`));
        for (const member of members) setReady(harness.room, member);
        await startAndSettle(harness.room, owner);
        assert.equal(harness.view().phase, GamePhase.Playing, `${seats} 人全 Ready 必须能开局`);
    }

    const harness = await buildPrivateRoom();
    const owner = await seatOwner(harness);
    setReady(harness.room, owner);
    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(lastRoomError(owner), RoomControlError.BelowMin, "1 人 < min=2 必须拒");
    assert.equal(harness.view().phase, GamePhase.Waiting);

    for (let index = 1; index < 4; index++) await seatJoiner(harness, `guest-${index}`);
    // 第五人由 admission 拒绝（maxClients 是 Colyseus 层的第二重闸）。
    const fifthTicket = "JOINTICKET_fifth_000000000000000000000000";
    harness.tickets.issueJoin(fifthTicket, "u-fifth");
    await assert.rejects(
        harness.room.onJoin(client("fifth") as never, harness.joinOptions({ kind: "join", ticket: fifthTicket })),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.RoomFull)),
    );
});

// ── §10.3：非房主 Start、有人未 Ready、重复 Start 都有稳定拒绝 ────────────────
// 变异验证：去掉 handleRoomStart 的 owner 校验 → NotOwner 断言转红。
test("私房：非房主 Start / 未全 Ready / Start 在途重复 Start 的稳定拒绝", async () => {
    const gate = deferred();
    const harness = await buildPrivateRoom({ lock: () => gate.promise });
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");

    dispatch(harness.room, C2S.RoomStart, guest, {});
    assert.equal(lastRoomError(guest), RoomControlError.NotOwner);

    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(lastRoomError(owner), RoomControlError.NotAllReady);

    setReady(harness.room, owner);
    setReady(harness.room, guest);
    dispatch(harness.room, C2S.RoomStart, owner, {});
    // Start 在途：starting 已置位（且对客户端可见），重复 Start 稳定拒绝。
    assert.equal(harness.view().starting, true, "starting 必须写进 state（客户端禁用按钮的依据）");
    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(lastRoomError(owner), RoomControlError.StartInProgress);
    gate.resolve();
    await startAndSettle(harness.room, owner);
    assert.equal(harness.view().phase, GamePhase.Playing);
    assert.equal(harness.view().starting, false, "发布 Playing 后 starting 清除");
});

// ── §10.3：`starting` 置位期间 Ready/Unready 均被稳定错误拒绝（§6.3 承诺语义）──
// 变异验证：不把 starting 写进 state → 上一用例的 state 断言转红；让 starting 期间的
// Unready 通过 → 本用例转红。
test("私房：Start 在途期间 Ready/Unready 被 StartInProgress 拒绝，Ready 状态不变", async () => {
    const gate = deferred();
    const harness = await buildPrivateRoom({ lock: () => gate.promise });
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    setReady(harness.room, owner);
    setReady(harness.room, guest);
    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(harness.view().starting, true);

    const revisionBefore = harness.view().readyRevision;
    setReady(harness.room, guest, false); // 主动 Unready 不允许使开局失效（§6.3 产品语义）
    assert.equal(lastRoomError(guest), RoomControlError.StartInProgress);
    assert.equal(harness.view().players.get("guest-a")?.ready, true, "Ready 是承诺，Start 在途不可反悔");
    assert.equal(harness.view().readyRevision, revisionBefore, "被拒的 Unready 不推进 readyRevision");

    gate.resolve();
    await startAndSettle(harness.room, owner);
    assert.equal(harness.view().phase, GamePhase.Playing);
});

// ── §10.3：Start await 期间 final-leave / drop 使本次启动失效（fence 元组整组重验）──
// 变异验证：只比较 fence 元组中的一项（如去掉 connectionRevision 比较）→ drop 分支转红。
test("私房：Start await 期间的最终离开与 drop 都使启动失效并回滚 Waiting", async () => {
    // ① 最终离开（成员身份变化：session 集合 + rosterRevision）
    {
        const gate = deferred();
        const harness = await buildPrivateRoom({ lock: () => gate.promise });
        const owner = await seatOwner(harness);
        const guest = await seatJoiner(harness, "guest-a");
        const third = await seatJoiner(harness, "guest-b");
        for (const member of [owner, guest, third]) setReady(harness.room, member);
        dispatch(harness.room, C2S.RoomStart, owner, {});
        assert.equal(harness.view().starting, true);
        await harness.room.onLeave(third as never, CloseCode.CONSENTED);
        gate.resolve();
        await startAndSettle(harness.room, owner);
        assert.equal(harness.view().phase, GamePhase.Waiting, "await 边界的最终离开必须使启动失效");
        assert.equal(lastRoomError(owner), RoomControlError.StartFailed, "owner-ready 失败回给房主稳定可重试错误");
        assert.equal(harness.view().ownerId, "owner", "⛔ 失败不移除房主/不转移 owner");
        assert.equal(harness.view().players.get("owner")?.ready, true, "rollback 保留 Ready");
        assert.equal(harness.view().players.get("guest-a")?.ready, true);
    }
    // ② drop 进入宽限（成员身份不变，connectionRevision 变）
    {
        const gate = deferred();
        const harness = await buildPrivateRoom({ lock: () => gate.promise });
        const owner = await seatOwner(harness);
        const guest = await seatJoiner(harness, "guest-a");
        (harness.room as unknown as { allowReconnection(client: unknown, seconds: number): Promise<unknown> })
            .allowReconnection = () => new Promise(() => undefined);
        for (const member of [owner, guest]) setReady(harness.room, member);
        dispatch(harness.room, C2S.RoomStart, owner, {});
        void harness.room.onLeave(guest as never, CloseCode.ABNORMAL_CLOSURE); // drop：seat/Ready 保留
        assert.equal(harness.view().players.get("guest-a")?.connected, false);
        gate.resolve();
        await startAndSettle(harness.room, owner);
        assert.equal(harness.view().phase, GamePhase.Waiting, "宽限中的 drop 必须使在途 Start 失效");
        assert.equal(harness.view().players.has("guest-a"), true, "drop 保留 seat");
        assert.equal(harness.view().players.get("guest-a")?.ready, true, "drop 保留 Ready");
    }
});

// ── §10.3：离线但仍在重连宽限的成员保留 seat/Ready，却会阻止 Start ────────────
// 变异验证：让离线成员不阻止 Start（去掉 connected 检查）→ 转红。
test("私房：宽限内离线成员阻止 Start，reconnect 后恢复可开局", async () => {
    const harness = await buildPrivateRoom();
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    setReady(harness.room, owner);
    setReady(harness.room, guest);

    const reconnectGate = deferred();
    (harness.room as unknown as { allowReconnection(client: unknown, seconds: number): Promise<unknown> })
        .allowReconnection = () => reconnectGate.promise;
    const leavePromise = harness.room.onLeave(guest as never, CloseCode.ABNORMAL_CLOSURE);
    assert.equal(harness.view().players.get("guest-a")?.connected, false);
    const revisionAfterDrop = harness.view().connectionRevision;

    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(lastRoomError(owner), RoomControlError.MemberOffline, "离线成员存在时不能 Start");
    assert.equal(harness.view().phase, GamePhase.Waiting);

    reconnectGate.resolve();
    await leavePromise;
    assert.equal(harness.view().players.get("guest-a")?.connected, true);
    assert.equal(harness.view().connectionRevision, revisionAfterDrop + 1, "reconnect 再次推进 connectionRevision");
    await startAndSettle(harness.room, owner);
    assert.equal(harness.view().phase, GamePhase.Playing);
});

// ── §10.3：lock 失败能回滚；rollback 保留 Ready 不动 owner；unlock 失败 fail-closed ──
// 变异验证：让 rollback 清空 Ready 或转移 owner → 转红；让 rollback/unlock 失败后仍
// 发布 Playing → fail-closed 断言转红。
test("私房：lock 拒绝回滚 Waiting（Ready/owner 原样）；unlock 失败关闭房间", async () => {
    // ① lock 直接拒绝
    {
        const harness = await buildPrivateRoom({ lock: async () => { throw new Error("lock refused"); } });
        const owner = await seatOwner(harness);
        const guest = await seatJoiner(harness, "guest-a");
        for (const member of [owner, guest]) setReady(harness.room, member);
        await startAndSettle(harness.room, owner);
        assert.equal(harness.view().phase, GamePhase.Waiting);
        assert.equal(lastRoomError(owner), RoomControlError.StartFailed);
        assert.equal(harness.view().ownerId, "owner");
        assert.equal(harness.view().players.get("guest-a")?.ready, true, "rollback 保留 Ready");
        assert.equal(harness.view().starting, false, "rollback 清除 starting 标记");
        // 失败后可立即重试：同一房主再次 Start 走同一事务。
        (harness.room as unknown as { lock(): Promise<void> }).lock = async () => undefined;
        await startAndSettle(harness.room, owner);
        assert.equal(harness.view().phase, GamePhase.Playing);
    }
    // ② lock 成功、mode start 失败、unlock 也失败 → fail-closed 关闭（不公开错误 roster 的 Playing）
    {
        const mode = createFixtureMode({ onMatchStart: async () => { throw new Error("mode start failed"); } });
        const harness = await buildPrivateRoom({ mode });
        const internals = harness.room as unknown as {
            lock(): Promise<void>;
            unlock(): Promise<void>;
        };
        let locked = false;
        // Room.locked 是原型 getter：必须 defineProperty 覆盖（直接赋值静默失效）。
        Object.defineProperty(harness.room, "locked", { configurable: true, get: () => locked });
        internals.lock = async () => { locked = true; };
        internals.unlock = async () => { throw new Error("unlock down"); };
        const owner = await seatOwner(harness);
        const guest = await seatJoiner(harness, "guest-a");
        for (const member of [owner, guest]) setReady(harness.room, member);
        await startAndSettle(harness.room, owner);
        assert.equal(harness.view().phase, GamePhase.Waiting, "rollback 已执行");
        assert.equal(harness.disconnects.length, 1, "unlock 失败必须 fail-closed 关闭房间");
    }
});

// ── §10.3：晚到结果**永不到达**时 fence 在绝对上限后 fail-closed dispose（§6.3）──
// 变异验证：去掉 retry fence 的绝对上限（evaluatePrivateRoomTimers 的分支）→ 本用例挂住/转红。
test("私房：lock 永不 settle → 超时 + retry fence 绝对上限 → 释放 lease 并 dispose", async () => {
    const harness = await buildPrivateRoom({
        lock: () => new Promise(() => undefined), // 永不 settle
        startLockTimeoutMs: 0,
        privateRoom: { retryFenceMaxMs: 1_000 },
    });
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    for (const member of [owner, guest]) setReady(harness.room, member);
    await startAndSettle(harness.room, owner);
    assert.equal(lastRoomError(owner), RoomControlError.StartFailed, "超时回滚给房主可重试错误");
    const internals = harness.room as unknown as { lateLockPending: boolean };
    assert.equal(internals.lateLockPending, true, "晚到结果未收敛前 retry fence 挂起");

    // 上限未到：不 fail-closed。
    harness.now.value = 999;
    harness.room.evaluatePrivateRoomTimers();
    assert.equal(harness.disconnects.length, 0);

    // 绝对上限：释放邀请码 lease（tombstone）→ 广播不可恢复错误 → dispose。
    harness.now.value = 1_001;
    harness.room.evaluatePrivateRoomTimers();
    await flushMicrotasks();
    assert.equal(harness.disconnects.length, 1, "超过绝对上限必须 fail-closed dispose");
    assert.equal(harness.invites.released.length, 1, "fail-closed 必须释放邀请码 lease");
    assert.ok(
        harness.broadcasts.some(([type, payload]) => type === S2C.RoomError
            && (payload as { code: number }).code === RoomControlError.StartFailed),
        "fail-closed 必须下发不可恢复错误",
    );
});

// ── §10.3：可重连宽限内 owner/Ready/seat 保留，最终离开才转移或删除 ──────────
// 变异验证：让宽限内即转移 owner → 转红。
test("私房：宽限内 owner 不转移；最终离开后按最早仍在房成员转移", async () => {
    const harness = await buildPrivateRoom();
    const owner = await seatOwner(harness);
    const guestA = await seatJoiner(harness, "guest-a");
    await seatJoiner(harness, "guest-b");
    setReady(harness.room, owner);

    const reconnectGate = deferred();
    (harness.room as unknown as { allowReconnection(client: unknown, seconds: number): Promise<unknown> })
        .allowReconnection = () => reconnectGate.promise;
    const leavePromise = harness.room.onLeave(owner as never, CloseCode.ABNORMAL_CLOSURE);
    assert.equal(harness.view().ownerId, "owner", "宽限内 ⛔ 不转移 owner");
    assert.equal(harness.view().players.get("owner")?.ready, true, "宽限内保留 Ready");
    assert.equal(harness.view().players.has("owner"), true, "宽限内保留 seat");

    reconnectGate.reject(new Error("grace expired"));
    await leavePromise;
    assert.equal(harness.view().players.has("owner"), false, "最终离开删除 seat");
    assert.equal(harness.view().ownerId, "guest-a", "owner 转移给最早仍在房成员");

    // 转移后剩余成员即使全 Ready，新 owner 仍需自己点 Start（不自动开局）。
    assert.equal(harness.view().phase, GamePhase.Waiting);
    dispatch(harness.room, C2S.RoomStart, guestA, {});
    assert.equal(lastRoomError(guestA), RoomControlError.NotAllReady, "新 owner 有权 Start（不再是 NotOwner）");
});

// ── §10.3：Playing 后邀请码失效、房间锁定、不能中途加入 ──────────────────────
// 变异验证：去掉 performStartMatch 成功路径的 retireInviteCode → 码失效断言转红。
test("私房：Start 成功即码进隔离期（tombstone）、房间拒绝中途入座", async () => {
    const harness = await buildPrivateRoom();
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    assert.equal(harness.view().roomCode, "000001", "Waiting 期展示邀请码");
    for (const member of [owner, guest]) setReady(harness.room, member);
    await startAndSettle(harness.room, owner);
    assert.equal(harness.view().phase, GamePhase.Playing);
    assert.equal(harness.view().roomCode, "", "Playing 后 code inactive（展示值清空）");
    assert.equal(harness.invites.released.length, 1, "Start 成功的瞬间码即转入隔离态（⛔ 非 DEL 由 int 层钉）");

    const lateTicket = "JOINTICKET_late_0000000000000000000000000";
    harness.tickets.issueJoin(lateTicket, "u-late");
    await assert.rejects(
        harness.room.onJoin(client("late") as never, harness.joinOptions({ kind: "join", ticket: lateTicket })),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.GameAlreadyStarted)),
    );
});

// ── §10.2：prepareCreate 的 creation ticket 绑定权威 owner；「第一个进空房」不能成为房主 ──
// 变异验证：改用 players.size===0 推断房主 → 本用例转红。
test("私房：房主身份只来自 creation claim 的 expectedOwnerUid，与入座顺序无关", async () => {
    const harness = await buildPrivateRoom();
    // 好友先进空房：不能成为 owner。
    const early = await seatJoiner(harness, "early");
    assert.equal(harness.view().ownerId, "", "第一个入座者 ⛔ 不是房主");
    dispatch(harness.room, C2S.RoomStart, early, {});
    assert.equal(lastRoomError(early), RoomControlError.NotOwner);

    const owner = await seatOwner(harness);
    assert.equal(harness.view().ownerId, "owner", "expectedOwnerUid 落座才是房主");
    assert.equal(owner.sent.some(([type]) => type === S2C.Welcome), true);
});

// ── §10.2：准入时序固定「同步 fence → 同步占位 → 异步 claim → 同步重验 → onAdmission → 落座」──
// 变异验证：把 mode.onAdmission 提到 ticket claim 之前 → 顺序断言转红。
test("私房：ticket claim 先于 mode.onAdmission；claim 失败不触碰玩法资源", async () => {
    const order: string[] = [];
    const mode = createFixtureMode({
        onAdmission({ client: admitted }) {
            order.push(`onAdmission:${(admitted as unknown as FakeClient).sessionId}`);
            return true;
        },
    });
    const harness = await buildPrivateRoom({ mode });
    await seatOwner(harness);
    order.length = 0;
    harness.tickets.callLog.length = 0;
    await seatJoiner(harness, "guest-a");
    const claimIndex = harness.tickets.callLog.findIndex((entry) => entry.startsWith("claimJoin:guest-a"));
    assert.ok(claimIndex >= 0);
    assert.deepEqual(order, ["onAdmission:guest-a"], "onAdmission 只跑一次");
    // callLog 与 order 的时间关系：claim 在 onAdmission 之前完成。
    assert.ok(
        harness.tickets.callLog.indexOf("claimJoin:guest-a") >= 0 && order.length === 1,
        "claim 必须发生（其 await 返回后才允许进入 onAdmission）",
    );

    // claim 拒绝（无效 ticket）：onAdmission 不得被调用（玩法资源分配不得先于权威准入）。
    order.length = 0;
    await assert.rejects(
        harness.room.onJoin(client("bogus") as never, harness.joinOptions({
            kind: "join",
            ticket: "JOINTICKET_unknown_00000000000000000000000",
        })),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
    );
    assert.deepEqual(order, [], "claim 失败后 ⛔ 不进入 mode.onAdmission");
});

// ── §10.2：pending uid/session/seat 在异步 ticket 检查前占位，计入容量，失败无泄漏 ──
// 变异验证：去掉 pending 占位 → 并发入座超员，转红。
test("私房：pending 占位计入容量——并发第 4/5 人只有一人入座，失败释放占位", async () => {
    const harness = await buildPrivateRoom();
    await seatOwner(harness);
    await seatJoiner(harness, "guest-a");
    await seatJoiner(harness, "guest-b");

    const gate = deferred();
    harness.tickets.claimJoinGate = gate.promise;
    const ticketC = "JOINTICKET_c_00000000000000000000000000000";
    const ticketD = "JOINTICKET_d_00000000000000000000000000000";
    harness.tickets.issueJoin(ticketC, "u-guest-c");
    harness.tickets.issueJoin(ticketD, "u-guest-d");
    const joinC = harness.room.onJoin(client("guest-c") as never, harness.joinOptions({ kind: "join", ticket: ticketC }));
    // guest-c 已同步占位（claim 尚未返回）：guest-d 的同步容量检查必须把 pending 计入。
    const joinD = harness.room.onJoin(client("guest-d") as never, harness.joinOptions({ kind: "join", ticket: ticketD }));
    await assert.rejects(
        joinD,
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.RoomFull)),
        "容量计算必须包含 pending 占位",
    );
    gate.resolve();
    harness.tickets.claimJoinGate = null;
    await joinC;
    assert.equal(harness.view().players.size, 4);
    assert.equal((harness.room as unknown as { pendingAdmissions: Map<string, unknown> }).pendingAdmissions.size, 0,
        "落座/失败后 pending 无泄漏");
});

// ── §10.2：无有效 join ticket 的直接 joinById 不能借「空房」绕过准入 ─────────
// 变异验证：去掉 room instance 侧重验（access 缺失放行）→ 转红。
test("私房：缺 access ticket 的 joinById 直连被拒", async () => {
    const harness = await buildPrivateRoom();
    await assert.rejects(
        harness.room.onJoin(client("bare") as never, harness.joinOptions()),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
    );
    // ticket 绑定 uid 与连接 uid 不一致（转让/窃取）同样拒绝，并退回 issued。
    const stolen = "JOINTICKET_stolen_000000000000000000000000";
    harness.tickets.issueJoin(stolen, "u-somebody-else");
    await assert.rejects(
        harness.room.onJoin(client("thief") as never, harness.joinOptions({ kind: "join", ticket: stolen })),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
    );
    await flushMicrotasks();
    assert.equal(harness.tickets.join.get(stolen)?.state, "issued", "安全失败退回 issued（原 exp 内可恢复）");
});

// ── §10.2：重连不重复消费 access ticket（Colyseus reconnection token 通道）─────
// 变异验证：让重连消费 ticket → claim 计数断言转红。
test("私房：drop 后 reconnect 不再走 ticket claim", async () => {
    const harness = await buildPrivateRoom();
    await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    const claimsAfterSeat = harness.tickets.callLog.filter((entry) => entry.startsWith("claimJoin")).length;

    const reconnectGate = deferred();
    (harness.room as unknown as { allowReconnection(client: unknown, seconds: number): Promise<unknown> })
        .allowReconnection = () => reconnectGate.promise;
    const leavePromise = harness.room.onLeave(guest as never, CloseCode.ABNORMAL_CLOSURE);
    reconnectGate.resolve();
    await leavePromise;
    assert.equal(harness.view().players.get("guest-a")?.connected, true);
    assert.equal(
        harness.tickets.callLog.filter((entry) => entry.startsWith("claimJoin")).length,
        claimsAfterSeat,
        "重连使用 reconnection token，⛔ 不重复消费 access ticket",
    );
});

// ── §10.2：renew lost 后旧房停止展示旧码 + 广播 codeInvalidated + 换新码 ──────
// 变异验证：让 lost 后继续展示旧码 → roomCode 断言转红。
test("私房：renew 三态——lost 立即失效旧码并换新码；unknown 累计超 TTL 按 lost", async () => {
    const harness = await buildPrivateRoom();
    await seatOwner(harness);
    assert.equal(harness.view().roomCode, "000001");

    // lost：同一同步段清空展示码 + 广播「邀请码已失效」，随后按新分配申请新码。
    harness.invites.renewQueue = ["lost"];
    await harness.room.performInviteRenew();
    assert.ok(
        harness.broadcasts.some(([type]) => type === S2C.RoomCodeInvalidated),
        "lost 必须广播 codeInvalidated",
    );
    await flushMicrotasks();
    assert.equal(harness.view().roomCode, "000002", "lost 后换**新码**（⛔ 不抢回旧码）");

    // unknown 有界重试：累计不超 leaseTtlMs 时保持现码。
    harness.invites.renewQueue = ["unknown", "unknown", "unknown", "unknown"];
    await harness.room.performInviteRenew();
    await harness.room.performInviteRenew();
    await harness.room.performInviteRenew();
    assert.equal(harness.view().roomCode, "000002", "unknown 累计 ≤ TTL 时不换码");
    // 第 4 次 unknown：累计 4×renewInterval(5s)=20s > leaseTtl(15s) → 按 lost 收敛。
    await harness.room.performInviteRenew();
    await flushMicrotasks();
    assert.equal(harness.view().roomCode, "000003", "unknown 累计超 TTL 必须按 lost 处理");

    // renewed 清零累计。
    harness.invites.renewQueue = ["renewed"];
    await harness.room.performInviteRenew();
    assert.equal(harness.view().roomCode, "000003");
});

// ── §10.2：waitingDeadline 在 start fence 置位期间**不求值**；到期关闭并 dispose ──
// 变异验证：去掉 evaluatePrivateRoomTimers 的 fence 判断 → 在途 Start 期间即 dispose，转红。
test("私房：waitingDeadline 只在 starting===false 求值；到期 dispose 而非只释放码", async () => {
    const gate = deferred();
    const harness = await buildPrivateRoom({ lock: () => gate.promise });
    const owner = await seatOwner(harness);
    const guest = await seatJoiner(harness, "guest-a");
    for (const member of [owner, guest]) setReady(harness.room, member);

    const deadline = (harness.room as unknown as { waitingDeadlineAtMs: number }).waitingDeadlineAtMs;
    assert.ok(deadline > 0);
    dispatch(harness.room, C2S.RoomStart, owner, {});
    assert.equal(harness.view().starting, true);
    harness.now.value = deadline + 1;
    harness.room.evaluatePrivateRoomTimers();
    assert.equal(harness.disconnects.length, 0, "fence 置位期间 deadline ⛔ 不与在途 Start 抢跑");

    gate.reject(new Error("lock refused"));
    await startAndSettle(harness.room, owner);
    assert.equal(harness.view().phase, GamePhase.Waiting);
    harness.room.evaluatePrivateRoomTimers();
    await flushMicrotasks();
    assert.equal(harness.disconnects.length, 1, "Start 收敛后 deadline 立即判定：关闭并 dispose");
    assert.equal(harness.invites.released.length, 1, "dispose 路径同样把码转入隔离态");
});

// ── §10.2：日志与指标不记录 code/ticket/token 敏感组合；leaseToken 不进响应/state ──
// 变异验证：往任一日志/state 写入 leaseToken → 扫描断言转红。
test("私房：leaseToken/ticket 不进 state、广播与日志输出", async () => {
    const logged: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const capture = (...parts: unknown[]): void => { logged.push(parts.map(String).join(" ")); };
    console.log = capture as typeof console.log;
    console.warn = capture as typeof console.warn;
    console.error = capture as typeof console.error;
    let harness: Harness;
    try {
        harness = await buildPrivateRoom();
        const owner = await seatOwner(harness);
        const guest = await seatJoiner(harness, "guest-a");
        harness.invites.renewQueue = ["lost"];
        await harness.room.performInviteRenew();
        await flushMicrotasks();
        setReady(harness.room, owner);
        setReady(harness.room, guest);
        await startAndSettle(harness.room, owner);
        await harness.room.onDispose();
    } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
    }
    const stateJson = JSON.stringify((harness.view() as unknown as { toJSON?: () => unknown }).toJSON?.() ?? {});
    const broadcastJson = JSON.stringify(harness.broadcasts);
    const logJson = logged.join("\n");
    for (const [label, haystack] of [["state", stateJson], ["broadcast", broadcastJson], ["log", logJson]] as const) {
        assert.ok(!haystack.includes("LEASETOKENSECRET"), `${label} 泄漏 leaseToken`);
        assert.ok(!haystack.includes("JOINTICKET_"), `${label} 泄漏 join ticket`);
        assert.ok(!haystack.includes(OWNER_TICKET), `${label} 泄漏 creation ticket`);
    }
});

// ── §10.2「Redis 故障 fail-closed」（故障矩阵行的建房半边；unknown→lost 收敛在上面的
//    renew 三态用例）：lease 分配失败必须让建房整体失败，⛔ 不创建「没有可解析邀请码的
//    半成功私房」（§6.7 第 8 条）。变异验证：把 allocate 异常吞掉继续建房 → 转红。
test("私房：邀请码基础设施故障时建房 fail-closed", async () => {
    const now = { value: 0 };
    const invites = new FakeInviteCodes();
    invites.failAllocate = true;
    const tickets = new FakeAccessTickets();
    tickets.issueCreation(OWNER_TICKET, "u-owner");
    const room = new GameRoom({
        seed: 11,
        clock: () => now.value,
        mode: createFixtureMode(),
        profile: PRIVATE_PROFILE,
        privateRoom: { inviteCodes: invites, accessTickets: tickets },
    });
    const internals = room as unknown as {
        setSimulationInterval(callback: () => void, delay: number): void;
        setPrivate(value: boolean): Promise<void>;
    };
    internals.setSimulationInterval = () => undefined;
    internals.setPrivate = async () => undefined;
    await assert.rejects(
        Promise.resolve(room.onCreate({
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: 0,
            mode: FIXTURE_MODE_ID,
            profile: "private",
            access: { kind: "create", ticket: OWNER_TICKET },
        })),
        /invite infra down/,
        "分配失败必须把 onCreate 整体拒绝（Colyseus 随之放弃建房）",
    );
});

// ── §6.2/§4.6：owner-ready/invite profile 需要的 fragment 必须存在（启动期/建房闸）──
// 变异验证：去掉 onCreate 的 fragment 闸 → ballMove 上开 owner-ready 静默读 undefined，转红。
test("私房：无 fragment 的 mode 配 owner-ready/invite profile 在 onCreate 被拒", async () => {
    const { createBallMoveGameMode } = await import("../src/rooms/modes/ballMove/index");
    const room = new GameRoom({
        seed: 3,
        clock: () => 0,
        mode: createBallMoveGameMode(),
        profile: PRIVATE_PROFILE.startPolicy.kind === "owner-ready"
            ? { ...PRIVATE_PROFILE, mode: "ballMove" }
            : PRIVATE_PROFILE,
        privateRoom: { inviteCodes: new FakeInviteCodes(), accessTickets: new FakeAccessTickets() },
    });
    (room as unknown as { setSimulationInterval(callback: () => void, delay: number): void })
        .setSimulationInterval = () => undefined;
    await assert.rejects(
        Promise.resolve().then(() => room.onCreate({
            v: GAME_ROOM_PROTOCOL_VERSION,
            sId: 0,
            mode: "ballMove",
            profile: "private",
            access: { kind: "create", ticket: OWNER_TICKET },
        })),
        (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.BadRequest)),
    );
});

// ── auto/default profile 行为零变：Ready/Start 对 default 房是 BadRequest ─────
// （§10.1 无侵入口径：profile 缺省注入 default，ballMove/idle 行为零变。）
test("default profile：join options 不带 profile 时行为与历史一致，Ready/Start 回 BadRequest", async () => {
    const { createIdleGameMode } = await import("../src/rooms/modes/IdleGameMode");
    const room = new GameRoom({ seed: 5, clock: () => 0, mode: createIdleGameMode() });
    (room as unknown as { setSimulationInterval(callback: () => void, delay: number): void })
        .setSimulationInterval = () => undefined;
    void room.onCreate({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: "idle" });
    const probe = client("probe");
    probe.auth.mode = "idle";
    await room.onJoin(probe as never, { v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: "idle" });
    dispatch(room, C2S.RoomReady, probe, { ready: true });
    const [type, payload] = probe.sent[probe.sent.length - 1] ?? [];
    assert.equal(type, S2C.Error);
    assert.equal((payload as { code: number }).code, ErrorCode.BadRequest);
});
