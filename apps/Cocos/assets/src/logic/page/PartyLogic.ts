/**
 * 队伍事件页面逻辑（MMO MF6a-B3；逐字照 GuildLogic 的「唤醒式推送 + seq 自愈拉取」样板，无头单测：test/partyLogic.test.ts）。
 *
 * ⚠ 与 GuildLogic 同样刻意"有头无尾"：只有 Logic + 单测，无 View、不进 viewRegistry——它是队伍 UI 的行为契约起点。
 *
 * 契约语义（shared/protocol/lobbyRpc/domains/party.ts 是双端真源）：
 *  - 推送只带 seq + partyId（IPartyEventPush）；本地按「收到的最大 seq」记账，⛔ 不按连号消费；
 *  - 唤醒 seq ≤ 本地 seq → 迟到/重复，忽略；否则拉增量 getEvents(本地 seq)；
 *  - 拉到的最老一条仍跳号 = 窗口外 → 先回调 onGapRefresh（本地状态全量刷新）再继续；
 *  - partyId 是 seq 的命名空间：换队（唤醒 / 响应的 partyId ≠ 本地）必须重置水位；partyId=0 = 不在队；
 *  - 上线首拉 / 断线重连 / seq 不连续，三种情况走同一条 pull() 路径。
 *
 * 依赖注入（IPartyLogicDeps）：生产接 WebSocketClient 的 rpc/onPush；测试注入假实现。
 */
import { LobbyPush } from "../../shared/index";
import type { IPartyEvent, IPartyEventPush, IPartyGetEventsRes } from "../../shared/protocol/lobbyRpc/domains/party";

export interface IPartyLogicDeps {
    /** 拉增量：生产 = (s) => WebSocketClient.inst.rpc(PartyRpc.GetEvents, { sinceSeq: s }) */
    getEvents(sinceSeq: number, signal?: AbortSignal): Promise<IPartyGetEventsRes>;
    /** 订阅推送：生产 = (cb) => WebSocketClient.inst.onPush(LobbyPush.PartyEvent, cb)，返回解绑 */
    onPush(type: typeof LobbyPush.PartyEvent, cb: (data: IPartyEventPush) => void): () => void;
}

export class PartyLogic {
    private latestSeq = 0;
    /** 本地水位所属的队伍（0 = 不在队）。seq 是队内命名空间——换队必须重置水位 */
    private partyId = 0;
    private pullingGeneration: number | null = null;
    private pendingWakeGeneration: number | null = null;
    private generation = 0;
    private active = false;
    private controller: AbortController | null = null;
    private unbind: (() => void) | null = null;

    /** 新事件回调（seq 升序、去重后）——view 层在这里搬数据 */
    onEvents: (events: IPartyEvent[]) => void = () => {};
    /** 本地状态应全量刷新：增量跳号（窗口外）或检测到换队 / 离队 */
    onGapRefresh: () => void = () => {};
    /** 拉取失败回调（断线/超时等；下次唤醒或重新 start 自愈，⛔ 不在此重置水位） */
    onPullError: (e: unknown) => void = () => {};

    constructor(private readonly deps: IPartyLogicDeps) {}

    /** 进入页面：订阅推送 + 首拉（本地缓存的进度按 partyId 配对传入；无缓存传 0,0）。重复 start 先解上一次订阅。 */
    async start(sinceSeq = 0, partyId = 0, signal?: AbortSignal): Promise<void> {
        this.stop();
        const generation = ++this.generation;
        this.active = true;
        const controller = new AbortController();
        this.controller = controller;
        this.latestSeq = sinceSeq;
        this.partyId = partyId;
        let detach: (() => void) | null = null;
        if (signal) {
            const abort = () => {
                if (this.controller !== controller || this.generation !== generation) return;
                this.stop();
            };
            if (signal.aborted) abort();
            else {
                signal.addEventListener("abort", abort, { once: true });
                detach = () => signal.removeEventListener("abort", abort);
            }
        }
        if (!this.isCurrent(generation, controller)) {
            detach?.();
            return;
        }
        let unbind: (() => void) | null = null;
        try {
            unbind = this.deps.onPush(LobbyPush.PartyEvent, (p) => {
                void this.onWake(p, generation, controller).catch((e) => {
                    if (this.isCurrent(generation, controller)) this.reportPullError(e);
                });
            });
        } catch (e) {
            this.stop();
            throw e;
        }
        if (!this.isCurrent(generation, controller)) {
            try { unbind?.(); } catch (unbindError) {
                console.error("[PartyLogic] 失效订阅解绑异常", unbindError);
            }
            detach?.();
            return;
        }
        this.unbind = () => {
            const currentUnbind = unbind;
            unbind = null;
            currentUnbind?.();
            detach?.();
        };
        await this.pull(generation, controller);
    }

    /** 离开页面：解绑推送 + 清 pendingWake */
    stop(): void {
        this.active = false;
        this.generation++;
        this.unbind?.();
        this.unbind = null;
        this.pendingWakeGeneration = null;
        const controller = this.controller;
        this.controller = null;
        controller?.abort();
    }

    get seq(): number {
        return this.latestSeq;
    }

    get currentPartyId(): number {
        return this.partyId;
    }

    private async onWake(
        p: { seq: number; partyId: number }, generation: number, controller: AbortController,
    ): Promise<void> {
        if (!this.isCurrent(generation, controller)) return;
        // 换队信号：水位跨队无意义，先归零再拉（防「高 seq 队 → 低 seq 队」后唤醒全被当迟到）
        if (p.partyId !== this.partyId) {
            this.resetForParty(p.partyId);
            await this.pull(generation, controller);
            return;
        }
        if (p.seq <= this.latestSeq) return; // 迟到/重复唤醒（至少一次投递语义下正常）
        await this.pull(generation, controller);
    }

    private resetForParty(partyId: number): void {
        const hadState = this.partyId !== 0 || this.latestSeq !== 0;
        this.partyId = partyId;
        this.latestSeq = 0;
        if (hadState) this.onGapRefresh();
    }

    /** 拉增量；拉取中再来唤醒 → 合流（结束后补一轮，不并发拉）；失败走 onPullError 不抛出。 */
    private async pull(generation: number, controller: AbortController): Promise<void> {
        if (!this.isCurrent(generation, controller)) return;
        if (this.pullingGeneration === generation) {
            this.pendingWakeGeneration = generation;
            return;
        }
        this.pullingGeneration = generation;
        try {
            const res = await this.deps.getEvents(this.latestSeq, controller.signal);
            if (!this.isCurrent(generation, controller)) return;
            if (res.partyId !== this.partyId) {
                // 服务端视角的队伍与本地不一致（本设备换队未重建 logic / 他端换队 / 已离队）：重置水位后按新队补拉一轮
                this.resetForParty(res.partyId);
                if (res.partyId !== 0) this.pendingWakeGeneration = generation;
                return;
            }
            const fresh = res.events.filter((e) => e.seq > this.latestSeq);
            if (fresh.length > 0) {
                if (this.latestSeq > 0 && fresh[0].seq > this.latestSeq + 1) {
                    if (!this.isCurrent(generation, controller)) return;
                    this.onGapRefresh();
                }
                if (!this.isCurrent(generation, controller)) return;
                this.latestSeq = fresh[fresh.length - 1].seq;
                this.onEvents(fresh);
            }
            if (!this.isCurrent(generation, controller)) return;
            if (res.latestSeq > this.latestSeq) this.latestSeq = res.latestSeq;
        } catch (e) {
            if (this.isCurrent(generation, controller)) this.reportPullError(e);
        } finally {
            if (this.pullingGeneration !== generation) return;
            this.pullingGeneration = null;
            if (this.pendingWakeGeneration === generation) {
                this.pendingWakeGeneration = null;
                if (this.isCurrent(generation, controller)) {
                    void this.pull(generation, controller).catch((e) => {
                        if (this.isCurrent(generation, controller)) this.reportPullError(e);
                    });
                }
            }
        }
    }

    private isCurrent(generation: number, controller: AbortController): boolean {
        return this.active && this.generation === generation && this.controller === controller
            && !controller.signal.aborted;
    }

    private reportPullError(e: unknown): void {
        try { this.onPullError(e); } catch (callbackError) {
            console.error("[PartyLogic] onPullError 回调异常", callbackError);
        }
    }
}
