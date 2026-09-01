/**
 * 真实拆分拓扑冒烟：
 *
 * WebPlatform Public dev-login/areas → 游戏服 strict Lobby → 角色登记 →
 * GameRoom 移动/技能 → WebPlatform Admin ban/revoke → 游戏节点逐点 kick。
 *
 * 前置：
 *   1. 游戏 Redis + 游戏 MySQL 已启动并 bootstrap；
 *   2. 独立账号库已 migration，WebPlatform Public/Internal 两个 listener 已启动；
 *   3. 游戏服已启动且配置同一 WEBPLATFORM_SERVICE_SECRET；
 *   4. 若要验 GM 第二步，游戏服设置 ADMIN_API_SECRET，并把同值传给本进程。
 *
 * 运行：npm --workspace @game/server run smoke
 */
import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import {
    ApiPath,
    C2S,
    ForceLogoutReason,
    GameplayModeId,
    GAME_ROOM_PROTOCOL_VERSION,
    GAMEPLAY_CATALOG,
    LOBBY_PROTOCOL_VERSION,
    RoomName,
    S2C,
    WebPlatformPath,
    type IHealthRes,
    type INoticeListRes,
    type IPongRes,
    type ISkillResultRes,
    type IWelcomeRes,
    type WebPlatformAreaListResponse,
    type WebPlatformAreaServer,
    type WebPlatformLoginResponse,
} from "@game/shared";

const GAME_BASE = process.env.SERVER_URL ?? "http://127.0.0.1:2568";
const PORTAL_BASE = process.env.WEBPLATFORM_PUBLIC_URL ?? "http://127.0.0.1:2570";
const INTERNAL_BASE = process.env.WEBPLATFORM_INTERNAL_URL ?? "http://127.0.0.1:2571";
const WP_ADMIN_SECRET = process.env.WEBPLATFORM_ADMIN_SECRET ?? "dev-admin-secret";
const GAME_ADMIN_SECRET = process.env.ADMIN_API_SECRET ?? "";
let passed = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
    if (!condition) {
        console.error(`✗ ${name}`, detail ?? "");
        process.exit(1);
    }
    passed++;
    console.log(`✓ ${name}`);
}

function waitMessage<T>(room: Room, type: string, timeoutMs = 5_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`等待消息 ${type} 超时`)), timeoutMs);
        const unbind = room.onMessage(type, (message: T) => {
            clearTimeout(timer);
            unbind();
            resolve(message);
        });
    });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function json<T>(response: Response, label: string): Promise<T> {
    const body = await response.json().catch(() => null) as T | null;
    check(`${label}（HTTP ${response.status}）`, response.ok, body);
    return body as T;
}

async function devLogin(devKey: string, serverId: number): Promise<WebPlatformLoginResponse> {
    return json<WebPlatformLoginResponse>(await fetch(PORTAL_BASE + WebPlatformPath.DevLogin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ devKey, serverId, deviceId: "split-smoke" }),
    }), "WebPlatform dev-login");
}

async function areas(accessToken?: string): Promise<WebPlatformAreaListResponse> {
    return json<WebPlatformAreaListResponse>(await fetch(PORTAL_BASE + WebPlatformPath.ListAreas, {
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
    }), "WebPlatform area list");
}

function adminPath(action: "ban" | "revoke", userId: string): string {
    const template = action === "ban" ? WebPlatformPath.BanAccount : WebPlatformPath.RevokeAccount;
    return template.replace("{userId}", encodeURIComponent(userId));
}

async function accountAdmin(
    action: "ban" | "revoke",
    userId: string,
    operationId: string,
): Promise<{ accountExists: boolean; status: string }> {
    return json(await fetch(INTERNAL_BASE + adminPath(action, userId), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-admin-secret": WP_ADMIN_SECRET,
            "x-operator-id": "split-smoke",
        },
        body: JSON.stringify({ operationId, reason: "split topology smoke" }),
    }), `WebPlatform Admin ${action}`);
}

async function eventually(
    label: string,
    predicate: () => Promise<boolean>,
    timeoutMs = 8_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) {
            check(label, true);
            return;
        }
        await sleep(100);
    }
    check(label, false);
}

async function main(): Promise<void> {
    const health = await json<IHealthRes>(
        await fetch(GAME_BASE + ApiPath.Health),
        "游戏服 GET /healthz",
    );
    check("游戏服健康响应", health.status === "ok" && health.serverTime > 0, health);

    const publicAreas = await areas();
    const server = publicAreas.servers.find((item) => item.status !== "maintenance");
    check("目录含可进入区服", server !== undefined, publicAreas);
    const selected = server as WebPlatformAreaServer;
    const serverId = selected.serverId;

    const banKey = `smoke-ban-user-${Date.now().toString(36)}`;
    const login = await devLogin(banKey, serverId);
    check(
        "登录响应不泄漏身份上游字段且 token 视为不透明",
        /^u_\d+$/.test(login.userId)
            && login.accessToken.length > 0
            && typeof login.isNewAccount === "boolean"
            && !("openid" in login)
            && !("session_key" in login),
        login,
    );

    const notice = await json<INoticeListRes>(
        await fetch(GAME_BASE + "/notice/list"),
        "游戏服 GET /notice/list",
    );
    check(
        "公告按 at 倒序",
        notice.list.length > 0
            && notice.list.every((item, index) => index === 0 || notice.list[index - 1].at >= item.at),
        notice,
    );

    const client = new Client(selected.gameHttpUrl || GAME_BASE);
    let forgedRejected = false;
    try {
        await client.joinOrCreate(RoomName.Game, {
            v: GAME_ROOM_PROTOCOL_VERSION,
            token: "forged-opaque-token",
            sId: serverId,
            mode: GameplayModeId.BallMove,
            modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
            profile: "default",
        });
    } catch {
        forgedRejected = true;
    }
    check("伪 token 在 strict verify 拒连", forgedRejected);

    // LobbyRoom 使用 Colyseus 的标准 auth token 参数；战斗房同时允许显式 options.token，
    // 因此真实客户端也会在大厅 join 前写入 Client.auth.token。
    client.auth.token = login.accessToken;
    const lobby = await client.joinOrCreate(RoomName.Lobby, {
        v: LOBBY_PROTOCOL_VERSION,
        sId: serverId,
    });
    check("strict join Lobby", lobby.sessionId.length > 0);

    await eventually("Lobby onJoin 后角色登记可从 areas 读回", async () => {
        const list = await areas(login.accessToken);
        return list.myServerIds.includes(serverId);
    });

    const room = await client.joinOrCreate(RoomName.Game, {
        v: GAME_ROOM_PROTOCOL_VERSION,
        token: login.accessToken,
        sId: serverId,
        mode: GameplayModeId.BallMove,
        modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
        profile: "default",
    });
    check("strict join GameRoom", room.sessionId.length > 0, room.roomId);

    const welcome = await waitMessage<IWelcomeRes>(room, S2C.Welcome);
    check(
        "收到 S2C.Welcome",
        welcome.sessionId === room.sessionId && welcome.tickRate === 20,
        welcome,
    );

    const pongPromise = waitMessage<IPongRes>(room, S2C.Pong);
    room.send(C2S.Ping, { clientTime: Date.now() });
    const pong = await pongPromise;
    check("Ping → Pong", pong.serverTime > 0 && pong.clientTime > 0, pong);

    await sleep(300);
    const $ = getStateCallbacks(room);
    void $;
    const me = (room.state as any).players.get(room.sessionId);
    check("状态同步：players 含本机玩家", me != null && me.name.length > 0 && me.hp === 100);

    const x0 = me.x as number;
    room.send(C2S.Move, { dirX: 1, dirY: 0 });
    await sleep(500);
    const x1 = (room.state as any).players.get(room.sessionId).x as number;
    check("移动输入生效", x1 > x0, { x0, x1 });
    room.send(C2S.Move, { dirX: 0, dirY: 0 });

    const skillPromise = waitMessage<ISkillResultRes>(room, S2C.SkillResult);
    room.send(C2S.CastSkill, { skillId: 1, targetId: room.sessionId });
    const skill = await skillPromise;
    check(
        "技能结算广播",
        skill.casterId === room.sessionId && skill.damage >= 9 && skill.damage <= 11,
        skill,
    );

    await room.leave(true);

    const ban = await accountAdmin(
        "ban",
        login.userId,
        `smoke-ban-${Date.now().toString(36)}`,
    );
    check("ban 原子权威写成功", ban.accountExists && ban.status === "banned", ban);

    if (GAME_ADMIN_SECRET) {
        const kicked = await json<{ kicked: boolean }>(await fetch(GAME_BASE + "/admin/kick", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-admin-secret": GAME_ADMIN_SECRET,
            },
            body: JSON.stringify({ uid: login.userId, reason: ForceLogoutReason.Banned }),
        }), "游戏节点 POST /admin/kick");
        check("GM 第二步命中在线 Lobby", kicked.kicked === true, kicked);
    } else {
        console.warn("! 未设置 ADMIN_API_SECRET：本地跳过 GM 逐节点 kick；CI 必须设置并覆盖此分支");
    }

    const bannedLogin = await fetch(PORTAL_BASE + WebPlatformPath.DevLogin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ devKey: banKey, serverId }),
    });
    const bannedBody = await bannedLogin.json().catch(() => null) as { code?: string } | null;
    check(
        "ban 后同身份重新登录返回 ACCOUNT_BANNED",
        bannedLogin.status === 403 && bannedBody?.code === "ACCOUNT_BANNED",
        bannedBody,
    );

    let oldTokenRejected = false;
    try {
        await client.joinOrCreate(RoomName.Game, {
            v: GAME_ROOM_PROTOCOL_VERSION,
            token: login.accessToken,
            sId: serverId,
            mode: GameplayModeId.BallMove,
            modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
            profile: "default",
        });
    } catch {
        oldTokenRejected = true;
    }
    check("ban 后旧 token strict join 拒绝", oldTokenRejected);

    const revokeKey = `smoke-revoke-${Date.now().toString(36)}`;
    const revokeLogin = await devLogin(revokeKey, serverId);
    const revoked = await accountAdmin(
        "revoke",
        revokeLogin.userId,
        `smoke-revoke-op-${Date.now().toString(36)}`,
    );
    check("revoke 清会话但不封号", revoked.accountExists && revoked.status === "revoked", revoked);

    let revokedTokenRejected = false;
    try {
        await client.joinOrCreate(RoomName.Game, {
            v: GAME_ROOM_PROTOCOL_VERSION,
            token: revokeLogin.accessToken,
            sId: serverId,
            mode: GameplayModeId.BallMove,
            modeVersion: GAMEPLAY_CATALOG.ballMove.modeVersion,
            profile: "default",
        });
    } catch {
        revokedTokenRejected = true;
    }
    check("revoke 后旧 token strict join 拒绝", revokedTokenRejected);
    const relogin = await devLogin(revokeKey, serverId);
    check(
        "revoke 后可重新登录获得新 token",
        relogin.userId === revokeLogin.userId && relogin.accessToken !== revokeLogin.accessToken,
    );

    // ban 流程已通过 /admin/kick 关闭 Lobby；SDK 对已关闭 room 的 leave Promise 可能不再落定。
    // 加有界清理，确保进程只有真正跑到末尾才以 0 退出并打印完成哨兵。
    await Promise.race([
        lobby.leave(true).catch(() => undefined),
        sleep(250),
    ]);
    console.log(`\n全部通过（${passed} 项）`);
}

main().catch((error) => {
    console.error("✗ 拆分拓扑冒烟失败：", error);
    process.exit(1);
});
