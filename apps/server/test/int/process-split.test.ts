/**
 * PS：三个真实入口子进程 + 独立 Redis + 临时 MySQL 库；不装配测试 Room / mode。
 * 前置：MYSQL_URL 指向可建/删库的开发 MySQL，PATH 有 redis-server（或 REDIS_SERVER_BIN）。
 * 日志留在 TMPDIR/ps-process-split-*；自有库、Redis 和子进程在 finally 清理。
 * 范围限制：当前生产 catalog 无 private profile，因此私房仅验 prepare 拒绝；正向私房见 private-room.test.ts。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client as SDKClient, type Room as SDKRoom } from "@colyseus/sdk";
import type { RowDataPacket } from "mysql2/promise";
import {
    C2S, S2C, RoomName, RoomRpc, GamePhase, WorldPhase, GAMEPLAY_CATALOG, LOBBY_RPC_DOMAINS,
    GAME_ROOM_PROTOCOL_VERSION, WORLD_ROOM_PROTOCOL_VERSION, LOBBY_PROTOCOL_VERSION, LOBBY_MSG_RPC,
    LOBBY_RPC_RESPONSE_VALIDATORS, WebPlatformPath, validateWebPlatformLoginResponse, validateRpcReply,
    type IRpcReply, type IVersionRes, type IGameRoomJoinOptions, type IWorldRoomJoinOptions, type IGameRoomState,
    type WebPlatformLoginResponse,
} from "@game/shared";
import { WorldRpc, type IWorldEnterRes } from "@game/shared/protocol/lobbyRpc/domains/world";
import { kWorldInfo } from "../../src/core/infra/keys";
import { ProcessSplitStack, eventually, type SplitRole } from "./process-split-helpers";

const SID = 0;
// 可卸载包的域 / mode 仅按当前生成目录发现。动态路径使干净卸载后的 host tsc 不解析可选文件。
const modes = GAMEPLAY_CATALOG as Readonly<Record<string, { readonly modeVersion: number } | undefined>>;
const hasHold = LOBBY_RPC_DOMAINS.includes("mmo") && LOBBY_RPC_DOMAINS.includes("mmohold") && Boolean(modes.mmoWorld);
const hasSnake = LOBBY_RPC_DOMAINS.includes("snakeCosmetic") && Boolean(modes.snake);
const loadDomain = (domain: string): Promise<Record<string, unknown>> => import(`@game/shared/protocol/lobbyRpc/domains/${domain}`);
// 下列仅为测试所观察的字段；RPC 完整契约仍由当前目录生成的 response validator 验证。
interface CharacterProbe { character: { personaId: string; characterId: string } }
interface CosmeticProbe { profile: { equippedSkinId: number } }
interface WorldProbe { phase: string; population: number; instanceId: string; mapId: string; packId: string }
interface SnakeProbe { id: string; skinId: number; ai: boolean }
interface BaselineProbe { baselineId: string }
interface ChunkProbe extends BaselineProbe { index: number; kind: string; items: unknown[] }
const ballOptions = (): IGameRoomJoinOptions => ({
    v: GAME_ROOM_PROTOCOL_VERSION, sId: SID, mode: "ballMove",
    modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "default",
});
const snakeOptions = (): IGameRoomJoinOptions => ({
    v: GAME_ROOM_PROTOCOL_VERSION, sId: SID, mode: "snake",
    modeVersion: modes.snake!.modeVersion, profile: "dropIn",
});

async function rpcReply(room: SDKRoom, type: string, payload: unknown): Promise<IRpcReply> {
    const id = randomUUID();
    return new Promise<IRpcReply>((ok, fail) => {
        const unbind = room.onMessage(LOBBY_MSG_RPC, (raw: unknown) => {
            let reply: IRpcReply;
            try { reply = validateRpcReply(raw); } catch (error) {
                clearTimeout(timer);
                unbind();
                fail(error);
                return;
            }
            if (reply.id !== id) return;
            clearTimeout(timer);
            unbind();
            ok(reply);
        });
        const timer = setTimeout(() => { unbind(); fail(new Error(`${type} 响应超时`)); }, 15_000);
        room.send(LOBBY_MSG_RPC, { id, type, payload });
    });
}

async function rpc<T>(room: SDKRoom, type: string, payload: unknown): Promise<T> {
    const reply = await rpcReply(room, type, payload);
    assert.ok(reply.ok, `${type} 失败：${JSON.stringify(reply)}`);
    const validator = (LOBBY_RPC_RESPONSE_VALIDATORS as Readonly<Record<string, ((input: unknown) => unknown) | undefined>>)[type];
    assert.ok(validator, `已安装目录必须声明 ${type}`);
    return validator(reply.data) as T;
}

function snakeTracker(room: SDKRoom) {
    const begins: BaselineProbe[] = [];
    const chunks: ChunkProbe[] = [];
    const ends: BaselineProbe[] = [];
    const s2c = S2C as Readonly<Record<string, string>>;
    const c2s = C2S as Readonly<Record<string, string>>;
    room.onMessage(s2c.SnakeBaselineBegin, (value: BaselineProbe) => begins.push(value));
    room.onMessage(s2c.SnakeBaselineChunk, (value: ChunkProbe) => chunks.push(value));
    room.onMessage(s2c.SnakeBaselineEnd, (value: BaselineProbe) => ends.push(value));
    return async (): Promise<SnakeProbe> => {
        const root = (): { roomEpochId: string } => room.state as { roomEpochId: string };
        await eventually(() => Boolean(root()?.roomEpochId), "Snake 必须同步 roomEpochId");
        const before = begins.length;
        room.send(c2s.SnakeBaselineRequest, { roomEpochId: root().roomEpochId, afterSeq: 0 });
        await eventually(() => begins.length > before && ends.some((end) =>
            end.baselineId === begins.at(-1)?.baselineId), "必须收到完整 Snake baseline");
        const begin = begins.at(-1)!;
        const snakes = chunks.filter((chunk) => chunk.baselineId === begin.baselineId && chunk.kind === "snakes")
            .sort((a, b) => a.index - b.index).flatMap((chunk) => chunk.items as SnakeProbe[]);
        const own = snakes.find((snake) => snake.id === room.sessionId && !snake.ai);
        assert.ok(own, "baseline 必须包含本客户端的真人蛇");
        return own;
    };
}

test("PS：正式 lobby / game / world 三进程跨端点闭环", { timeout: 180_000 }, async (t) => {
    const stack = new ProcessSplitStack();
    const rooms = new Set<SDKRoom>();
    const retain = (room: SDKRoom): SDKRoom => {
        room.reconnection.enabled = false;
        room.onMessage("*", () => undefined);
        rooms.add(room);
        return room;
    };
    const leave = async (room: SDKRoom): Promise<void> => {
        if (!rooms.delete(room)) return;
        if (!room.connection.isOpen) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                room.leave(true),
                new Promise<never>((_ok, fail) => {
                    timer = setTimeout(() => { room.connection.close(); fail(new Error("SDK 离房超时")); }, 5_000);
                }),
            ]);
        } finally { clearTimeout(timer); }
    };
    const client = (role: SplitRole, session: WebPlatformLoginResponse): SDKClient => {
        const sdk = new SDKClient(stack.endpoint[role]);
        sdk.auth.token = session.accessToken;
        return sdk;
    };
    const login = async (label: string): Promise<WebPlatformLoginResponse> => {
        const response = await fetch(`${stack.http("lobby")}${WebPlatformPath.DevLogin}`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ devKey: `ps-${stack.runId}-${label}`, serverId: SID }),
            signal: AbortSignal.timeout(10_000),
        });
        assert.equal(response.status, 200, "真实 dev HTTP 登录必须成功");
        return validateWebPlatformLoginResponse(await response.json());
    };
    const lobbyFor = async (session: WebPlatformLoginResponse): Promise<SDKRoom> => retain(
        await client("lobby", session).joinOrCreate(RoomName.Lobby, { v: LOBBY_PROTOCOL_VERSION, sId: SID }));
    t.diagnostic(`子进程日志：${stack.logDir}；临时库：${stack.database}`);
    try {
        await stack.start();
        const session = await login("owner");
        const lobby = await lobbyFor(session);

        await t.test("三个 /version 回同一端点目录；六种错房型组合明确拒绝", async () => {
            for (const role of ["lobby", "game", "world"] as const) {
                const response = await fetch(`${stack.http(role)}/version`, { signal: AbortSignal.timeout(10_000) });
                assert.equal(response.status, 200);
                const version = await response.json() as IVersionRes;
                assert.equal(version.gameRoomProtocol, GAME_ROOM_PROTOCOL_VERSION);
                assert.equal(version.lobbyProtocol, LOBBY_PROTOCOL_VERSION);
                assert.equal(version.lobbyWs, stack.endpoint.lobby);
                assert.equal(version.gameWs, stack.endpoint.game);
                assert.equal(version.worldWs, stack.endpoint.world);
                for (const roomName of [RoomName.Lobby, RoomName.Game, RoomName.World]) {
                    if (roomName === role) continue;
                    await assert.rejects(client(role, session).joinOrCreate(roomName, {}),
                        new RegExp(`provided room name "${roomName}" not defined`), `${role} 不得承载 ${roomName}`);
                }
            }
        });

        await t.test("Lobby 生产模式拒绝 private；ballMove 在 game create / 另一账号 joinById", async () => {
            const rejected = await rpcReply(lobby, RoomRpc.PrepareCreate, {
                clientReqId: randomUUID(), mode: "ballMove", modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion, profile: "private",
            });
            assert.equal(rejected.ok, false);
            if (!rejected.ok) assert.equal(rejected.err.code, "INVALID_PAYLOAD");
            const friend = await login("friend");
            const friendLobby = await lobbyFor(friend);
            const ownerGame = retain(await client("game", session).create(RoomName.Game, ballOptions()));
            const friendGame = retain(await client("game", friend).joinById(ownerGame.roomId, ballOptions()));
            assert.equal(friendGame.roomId, ownerGame.roomId);
            await eventually(() => (ownerGame.state as IGameRoomState)?.phase === GamePhase.Playing,
                "两个 Lobby 签发的 dev token 必须在独立 game 进程完成准入并开始 ballMove");
            await leave(friendGame);
            await leave(ownerGame);
            await leave(friendLobby);
        });

        await t.test("Lobby 建角 / world.enter → world 首次建房、Registry 地址及离座检查点复入", { skip: hasHold ? false : "未安装 mmo/mmohold 场景" }, async () => {
            const { MmoRpc } = await loadDomain("mmo") as { MmoRpc: Record<string, string> };
            const { MMO_HOLD_MAP_ID, MMO_HOLD_PACK_ID } = await loadDomain("mmohold") as { MMO_HOLD_MAP_ID: string; MMO_HOLD_PACK_ID: string };
            const created = await rpc<CharacterProbe>(lobby, MmoRpc.CreateCharacter, {
                clientReqId: randomUUID(), slot: 0, name: `Ps${stack.runId}`, classId: "fighter", factionId: "dawn",
            });
            const enterPayload = { personaId: created.character.personaId, mapId: MMO_HOLD_MAP_ID };
            const entry = await rpc<IWorldEnterRes>(lobby, WorldRpc.Enter, enterPayload);
            assert.equal(entry.endpoint, stack.endpoint.world, "尚无 Registry 时必须回落已配置 world endpoint");
            assert.equal(entry.transferId, null);
            assert.equal(entry.worldAddress, `s${SID}/${MMO_HOLD_MAP_ID}/${entry.line}`);
            const [instances] = await stack.sql.query<(RowDataPacket & { instance_id: string; state: string })[]>(
                "SELECT instance_id, state FROM world_instance WHERE server_id = ? AND map_id = ?", [SID, MMO_HOLD_MAP_ID]);
            assert.equal(instances.length, 1);
            assert.equal(instances[0].state, WorldPhase.Offline, "Lobby 只建 SQL 行，不启动 WorldRoom");
            const infoKey = kWorldInfo(SID, instances[0].instance_id);
            assert.equal(await stack.redis.exists(infoKey), 0, "world 首次直连前没有活跃 Registry 登记");
            const joinWorld = async (ticket: string): Promise<SDKRoom> => retain(await client("world", session).joinOrCreate(RoomName.World, {
                v: WORLD_ROOM_PROTOCOL_VERSION, sId: SID, mode: "mmoWorld", modeVersion: modes.mmoWorld!.modeVersion,
                profile: "world", mapId: MMO_HOLD_MAP_ID, line: entry.line, personaId: created.character.personaId, ticket,
            } satisfies IWorldRoomJoinOptions));
            const world = await joinWorld(entry.ticket);
            await eventually(() => (world.state as WorldProbe)?.phase === WorldPhase.Active
                && (world.state as WorldProbe).population === 1, "正式 mmoWorld 必须进入 Active");
            assert.equal((world.state as WorldProbe).instanceId, instances[0].instance_id);
            assert.equal((world.state as WorldProbe).mapId, MMO_HOLD_MAP_ID);
            assert.equal((world.state as WorldProbe).packId, MMO_HOLD_PACK_ID);
            await eventually(async () => (await stack.redis.hget(infoKey, "seated")) === "1", "world 必须发布人数");
            const info = await stack.redis.hgetall(infoKey);
            assert.equal(info.publicAddress, stack.endpoint.world);
            assert.equal(info.mode, "mmoWorld");
            assert.ok(info.holder.includes(stack.nodeId.world), "Registry holder 必须来自 world 节点");
            await leave(world);
            await eventually(async () => (await stack.redis.hget(infoKey, "seated")) === "0", "离座人数必须发布为 0");
            await eventually(async () => {
                const [rows] = await stack.sql.query<RowDataPacket[]>(
                    "SELECT checkpoint_rev FROM k_mmo_character WHERE server_id = ? AND character_id = ?",
                    [SID, created.character.characterId]);
                return Number(rows[0]?.checkpoint_rev) > 0;
            }, "离线前必须持久化角色检查点");
            const reentry = await rpc<IWorldEnterRes>(lobby, WorldRpc.Enter, enterPayload);
            assert.equal(reentry.endpoint, info.publicAddress, "Lobby 必须读取另一进程发布的地址");
            assert.equal(reentry.worldAddress, entry.worldAddress);
            assert.notEqual(reentry.ticket, entry.ticket);
            const rejoined = await joinWorld(reentry.ticket);
            await eventually(() => (rejoined.state as WorldProbe)?.population === 1, "离线后用新票必须重新入座");
            assert.equal((rejoined.state as WorldProbe).instanceId, instances[0].instance_id);
            await leave(rejoined);
        });

        await t.test("Lobby 换装不改当前 Snake 快照；同一 game 进程下次准入读取新皮肤", { skip: hasSnake ? false : "未安装 snake 场景" }, async () => {
            const { SnakeCosmeticRpc } = await loadDomain("snakeCosmetic") as { SnakeCosmeticRpc: Record<string, string> };
            const keyModule = "../../src/rooms/modes/" + "snake/keys";
            const { kSnakeUser } = await import(keyModule) as { kSnakeUser(uid: string): string };
            const snakeSession = await login("snake");
            const snakeLobby = await lobbyFor(snakeSession);
            const key = kSnakeUser(snakeSession.userId);
            // 只预置拥有关系；换装操作、准入水合与网络 baseline 全走实际产品路径。
            await stack.redis.hset(key, "equippedSkinId", "1", "ownedSkinIds", "[1,401]",
                "fragmentBalances", '{"133":0,"401":0,"403":0,"411":0}');
            const initial = await rpc<CosmeticProbe>(snakeLobby, SnakeCosmeticRpc.GetSnapshot, {});
            assert.equal(initial.profile.equippedSkinId, 1);
            const first = retain(await client("game", snakeSession).joinOrCreate(RoomName.Game, snakeOptions()));
            const firstSnake = snakeTracker(first);
            assert.equal((await firstSnake()).skinId, 1);
            const equipped = await rpc<CosmeticProbe>(snakeLobby, SnakeCosmeticRpc.Equip, { skinId: 401 });
            assert.equal(equipped.profile.equippedSkinId, 401);
            await eventually(async () => await stack.redis.hget(key, "equippedSkinId") === "401", "Lobby 换装必须落 Redis");
            assert.equal((await firstSnake()).skinId, 1, "当前局外观是准入时冻结的快照");
            await leave(first);
            const second = retain(await client("game", snakeSession).joinOrCreate(RoomName.Game, snakeOptions()));
            assert.equal((await snakeTracker(second)()).skinId, 401, "game 缓存旧皮肤后再次准入必须重新水合");
            await leave(second);
            await leave(snakeLobby);
        });
    } finally {
        try { await Promise.all([...rooms].map(leave)); } finally { await stack.close(); }
    }
});
