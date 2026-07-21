/**
 * 端到端冒烟测试（真实链路）：/healthz → dev-login（真实建号/token）→ 选服/公告 →
 * 带真 token 进 GameRoom → 移动/技能 → 伪 token 拒连。对着**运行中的 dev server** 跑，
 * 验「进程真的起得来 + 全链真的通」——与 test:int 的 boot(server) 是不同维度。
 * 前置：本地栈已起（stack + db:bootstrap，dev-login 走真实账号链路）+ npm run dev。
 * 运行：npm --workspace @game/server run smoke
 */
import { Client, getStateCallbacks } from "@colyseus/sdk";
import {
    RoomName,
    ApiPath,
    PROTOCOL_VERSION,
    S2C,
    C2S,
    type ILoginRes,
    type IHealthRes,
    type IAreaListRes,
    type INoticeListRes,
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
    // ---------- 真实 HTTP：健康检查 + dev-login（真实账号链路） ----------
    const health = (await fetch(BASE + ApiPath.Health).then((r) => r.json())) as IHealthRes;
    check("GET /healthz", health.status === "ok" && health.serverTime > 0, health);

    const loginRes = await fetch(BASE + ApiPath.DevLogin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ devKey: "smoke" }),
    });
    check("POST /account/dev-login（HTTP 2xx）", loginRes.ok, loginRes.status);
    const loginData = (await loginRes.json()) as ILoginRes;
    check("dev-login 契约（userId/token 形制）", loginData.userId.startsWith("u_")
        && /\.[0-9a-f]{48}$/.test(loginData.token) && typeof loginData.isNew === "boolean", loginData);

    // ---------- 真实 HTTP：选服列表 + 公告（config 驱动，无栈）----------
    const areaList = (await fetch(BASE + "/area/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
    }).then((r) => r.json())) as IAreaListRes;
    check("POST /area/list", Array.isArray(areaList.al) && areaList.al.length > 0
        && typeof areaList.al[0].sId === "number" && Array.isArray(areaList.ul), areaList);

    const notice = (await fetch(BASE + "/notice/list").then((r) => r.json())) as INoticeListRes;
    const noticeSorted = notice.list.every((n, i) => i === 0 || notice.list[i - 1].at >= n.at);
    check("GET /notice/list（按 at 倒序）", notice.list.length > 0 && noticeSorted, notice);

    // ---------- Colyseus 房间（真 token；伪 token 必须拒连） ----------
    const client = new Client(BASE);
    let rejected = false;
    try {
        await client.joinOrCreate(RoomName.Game, { v: PROTOCOL_VERSION, token: "forged-token" });
    } catch {
        rejected = true;
    }
    check("伪 token 拒连（去 mock 后无游客降级）", rejected);

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
