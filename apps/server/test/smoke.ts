/**
 * 端到端冒烟测试：验证 HTTP 模拟接口 + Colyseus 房间全链路。
 * 前置：服务端已启动（npm run dev:server）。
 * 运行：npm --workspace @game/server run smoke
 */
import { Client, getStateCallbacks } from "@colyseus/sdk";
import {
    RoomName,
    ApiPath,
    ErrorCode,
    PROTOCOL_VERSION,
    S2C,
    C2S,
    type IApiResponse,
    type ILoginRes,
    type IPlayerProfile,
    type IRankRes,
    type IHealthRes,
    type IWelcomeRes,
    type IPongRes,
    type ISkillResultRes,
} from "@game/shared";

// 默认端口与 .env.development 保持一致（本机 2567 被其他项目占用）
const BASE = process.env.SERVER_URL ?? "http://localhost:2568";
let passed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
    if (!cond) {
        console.error(`✗ ${name}`, detail ?? "");
        process.exit(1);
    }
    passed++;
    console.log(`✓ ${name}`);
}

function waitMessage<T>(room: any, type: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`等待消息 ${type} 超时`)), timeoutMs);
        const unbind = room.onMessage(type, (msg: T) => {
            clearTimeout(timer);
            unbind();
            resolve(msg);
        });
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    // ---------- HTTP 模拟接口 ----------
    const health = (await fetch(BASE + ApiPath.Health).then((r) => r.json())) as IApiResponse<IHealthRes>;
    check("GET /api/health", health.code === ErrorCode.Ok && health.data?.status === "ok", health);

    const login = (await fetch(BASE + ApiPath.Login, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "smoke-test" }),
    }).then((r) => r.json())) as IApiResponse<ILoginRes>;
    check("POST /api/login", login.code === ErrorCode.Ok && (login.data?.token.length ?? 0) > 0, login);
    const loginData = login.data!;

    const profile = (await fetch(BASE + ApiPath.Profile, {
        headers: { authorization: `Bearer ${loginData.token}` },
    }).then((r) => r.json())) as IApiResponse<IPlayerProfile>;
    check("GET /api/player/profile", profile.code === ErrorCode.Ok && profile.data?.openId === loginData.openId, profile);

    const badProfile = (await fetch(BASE + ApiPath.Profile).then((r) => r.json())) as IApiResponse<null>;
    check("profile 无 token 返回 TokenExpired", badProfile.code === ErrorCode.TokenExpired, badProfile);

    const rank = (await fetch(BASE + ApiPath.Rank).then((r) => r.json())) as IApiResponse<IRankRes>;
    check("GET /api/rank", rank.code === ErrorCode.Ok && rank.data?.list.length === 20 && rank.data?.list[0].rank === 1, rank);

    // ---------- Colyseus 房间 ----------
    const client = new Client(BASE);
    const room = await client.joinOrCreate(RoomName.Game, { v: PROTOCOL_VERSION, token: loginData.token });
    check("joinOrCreate('game')", room.sessionId.length > 0, room.roomId);

    // Welcome 消息（服务端 onJoin 即发，SDK 会缓存 join 前到达的消息直到注册处理器）
    const welcome = await waitMessage<IWelcomeRes>(room, S2C.Welcome);
    check("收到 S2C.Welcome", welcome.sessionId === room.sessionId && welcome.tickRate === 20, welcome);

    // Ping → Pong
    const pongPromise = waitMessage<IPongRes>(room, S2C.Pong);
    room.send(C2S.Ping, { clientTime: Date.now() });
    const pong = await pongPromise;
    check("Ping → Pong", pong.serverTime > 0 && pong.clientTime > 0, pong);

    // 状态同步：自己出现在 players 中
    await sleep(300);
    const $ = getStateCallbacks(room);
    void $; // 状态回调 API 可用性验证
    const me: any = (room.state as any).players.get(room.sessionId);
    check("状态同步：players 含本机玩家", me != null && me.name.length > 0 && me.hp === 100, me?.toJSON?.());

    // 移动：发送方向输入，等待若干逻辑帧后坐标变化
    const x0 = me.x;
    room.send(C2S.Move, { dirX: 1, dirY: 0 });
    await sleep(500);
    const x1 = (room.state as any).players.get(room.sessionId).x;
    check("移动输入生效（服务端积分）", x1 > x0, { x0, x1 });
    room.send(C2S.Move, { dirX: 0, dirY: 0 });

    // 技能：对自己释放，收到 SkillResult 且伤害进入合理区间
    const skillPromise = waitMessage<ISkillResultRes>(room, S2C.SkillResult);
    room.send(C2S.CastSkill, { skillId: 1, targetId: room.sessionId });
    const skill = await skillPromise;
    check("技能结算广播", skill.casterId === room.sessionId && skill.damage >= 9 && skill.damage <= 11, skill);
    await sleep(300);
    const hpAfter = (room.state as any).players.get(room.sessionId).hp;
    check("伤害已同步到状态", hpAfter === 100 - skill.damage, { hpAfter, damage: skill.damage });

    await room.leave(true);
    console.log(`\n全部通过（${passed} 项）`);
    process.exit(0);
}

main().catch((err) => {
    console.error("✗ 冒烟测试失败：", err);
    process.exit(1);
});
