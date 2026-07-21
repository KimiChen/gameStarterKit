/**
 * 工会事件页面逻辑——「唤醒式推送 + seq 自愈拉取」的客户端样板（无头单测：test/guildLogic.test.ts）。
 *
 * ⚠ **刻意"有头无尾"**（拍板保留）：只有 Logic + 单测，无 View、不进 viewRegistry——
 * 它的价值是给真实工会 UI 当**行为契约起点**（推送水位/自愈拉取语义已被测试钉死），
 * 落地 UI 时按四步动线补 View/注册即可，⛔ 不要因为"没有页面用"而删除本文件。
 *
 * 契约语义（shared/protocol/lobbyRpc/guild.ts 是双端真源）：
 *  - 推送只带 seq（IGuildEventPush）；本地按「收到的最大 seq」记账，⛔ 不按连号消费；
 *  - 唤醒 seq ≤ 本地 seq → 迟到/重复，忽略；否则拉增量 getEvents(本地 seq)；
 *  - 拉到的最老一条仍跳号 = 窗口外 → 先回调 onGapRefresh（本地状态全量刷新）再继续；
 *  - 上线首拉 / 断线重连 / seq 不连续，三种情况走同一条 pull() 路径。
 *
 * 依赖注入（IGuildLogicDeps）：生产接 WebSocketClient 的 rpc/onPush；测试注入假实现。
 */
import {
    LobbyPush,
    type IGuildEvent,
    type IGuildEventPush,
    type IGuildGetEventsRes,
} from "../../shared/index";

export interface IGuildLogicDeps {
    /** 拉增量：生产 = (s) => WebSocketClient.inst.rpc(GuildRpc.GetEvents, { sinceSeq: s }) */
    getEvents(sinceSeq: number): Promise<IGuildGetEventsRes>;
    /** 订阅推送：生产 = (cb) => WebSocketClient.inst.onPush(LobbyPush.GuildEvent, cb)，返回解绑 */
    onPush(type: typeof LobbyPush.GuildEvent, cb: (data: IGuildEventPush) => void): () => void;
}

export class GuildLogic {
    private latestSeq = 0;
    /** 本地水位所属的工会（0 = 未知/无工会）。seq 是工会内命名空间——换会必须重置水位 */
    private guildId = 0;
    private pulling = false;
    private pendingWake = false;
    private unbind: (() => void) | null = null;

    /** 新事件回调（seq 升序、去重后）——view 层在这里搬数据 */
    onEvents: (events: IGuildEvent[]) => void = () => {};
    /** 本地状态应全量刷新：增量跳号（窗口外）或检测到换会 */
    onGapRefresh: () => void = () => {};
    /** 拉取失败回调（断线/超时等；下次唤醒或重新 start 自愈，⛔ 不在此重置水位） */
    onPullError: (e: unknown) => void = () => {};

    constructor(private readonly deps: IGuildLogicDeps) {}

    /** 进入页面：订阅推送 + 首拉（本地缓存的进度按 guildId 配对传入；无缓存传 0,0）。
     *  重复 start（无 stop 重进页面）安全：先解上一次订阅，⛔ 不叠订阅（旧订阅会让死页面
     *  继续收 onWake→pull→onEvents 回调）。 */
    async start(sinceSeq = 0, guildId = 0): Promise<void> {
        this.stop();
        this.latestSeq = sinceSeq;
        this.guildId = guildId;
        this.unbind = this.deps.onPush(LobbyPush.GuildEvent, (p) => { void this.onWake(p); });
        await this.pull();
    }

    /** 离开页面：解绑推送 + 清 pendingWake（stop 后在途 pull 结束不得再补拉并回调已关闭页面） */
    stop(): void {
        this.unbind?.();
        this.unbind = null;
        this.pendingWake = false;
    }

    get seq(): number {
        return this.latestSeq;
    }

    private async onWake(p: { seq: number; guildId: number }): Promise<void> {
        // 换会信号：水位跨会无意义，先归零再拉（防「高 seq 会 → 低 seq 会」后唤醒全被当迟到）
        if (p.guildId !== this.guildId) {
            this.resetForGuild(p.guildId);
            await this.pull();
            return;
        }
        if (p.seq <= this.latestSeq) return; // 迟到/重复唤醒（至少一次投递语义下正常）
        await this.pull();
    }

    private resetForGuild(guildId: number): void {
        const hadState = this.guildId !== 0 || this.latestSeq !== 0;
        this.guildId = guildId;
        this.latestSeq = 0;
        if (hadState) this.onGapRefresh();
    }

    /** 拉增量；拉取中再来唤醒 → 合流（结束后补一轮，不并发拉）；失败走 onPullError 不抛出 */
    private async pull(): Promise<void> {
        if (this.pulling) {
            this.pendingWake = true;
            return;
        }
        this.pulling = true;
        try {
            const res = await this.deps.getEvents(this.latestSeq);
            if (res.guildId !== this.guildId) {
                // 服务端视角的工会与本地不一致（本设备换会未重建 logic / 他端换会）：
                // 重置水位后立刻按新会补拉一轮
                this.resetForGuild(res.guildId);
                if (res.guildId !== 0) this.pendingWake = true;
                return;
            }
            const fresh = res.events.filter((e) => e.seq > this.latestSeq);
            if (fresh.length > 0) {
                // 首拉（latestSeq=0）不算跳号；此后最老一条不衔接 = 窗口外
                if (this.latestSeq > 0 && fresh[0].seq > this.latestSeq + 1) this.onGapRefresh();
                this.latestSeq = fresh[fresh.length - 1].seq;
                this.onEvents(fresh);
            }
            if (res.latestSeq > this.latestSeq) this.latestSeq = res.latestSeq; // seq 空洞（坏行）容忍
        } catch (e) {
            // 断线/超时属常态（ws 通道）：吞掉并回调，水位不动——下次唤醒或页面重进自愈。
            // ⛔ 不能任由 rejection 逃逸（wake 路径是 fire-and-forget，会成为 unhandledRejection）
            this.onPullError(e);
        } finally {
            this.pulling = false;
            if (this.pendingWake) {
                this.pendingWake = false;
                void this.pull();
            }
        }
    }
}
