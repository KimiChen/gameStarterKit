import type {
    IGameDemoAlchemyState,
    IGameDemoAssets,
    IGameDemoBossList,
    IGameDemoBossState,
    IGameDemoGuildState,
    IGameDemoHeroState,
    IGameDemoMail,
    IGameDemoSeason,
} from "../../../shared/protocol/lobbyRpc/domains/gameDemo";
import { GAME_DEMO_CONFIG, type GameDemoBossId } from "../../../shared/protocol/lobbyRpc/checks/gameDemo";
import type { GameDemoRuntime } from "./gameDemoRuntime";

export class GameDemoLogic {
    onChanged: () => void = () => {};
    text = "正在连接原生服务端…";
    busy = false;
    page: 'shop' | 'mail' | 'hero' | 'alchemy' | 'season' | 'guild' | 'boss' = 'shop';
    mails: IGameDemoMail[] = [];
    mailPage = 0;
    assets: IGameDemoAssets | null = null;
    heroState: IGameDemoHeroState | null = null;
    alchemyState: IGameDemoAlchemyState | null = null;
    seasonState: IGameDemoSeason | null = null;
    rankPage = 0;
    guildState: IGameDemoGuildState | null = null;
    guildName = '修行仙盟';
    inviteTarget = '';
    invitePage = 0;
    bossList: IGameDemoBossList | null = null;
    bossState: IGameDemoBossState | null = null;
    bossId: GameDemoBossId | null = null;
    private bossGeneration = 0;
    private bossRefreshedAt = 0;
    private bossDirty = false;
    private alchemyAnimationUntil = 0;
    get alchemyAnimationRemaining(): number {
        return Math.max(0, this.alchemyAnimationUntil - (this.runtime?.now() ?? 0));
    }
    constructor(private readonly runtime: GameDemoRuntime | null) {}
    watchClock(signal: AbortSignal): void {
        this.runtime?.onBossSync(revision => this.receiveBossSync(revision), signal);
        let second = -1;
        this.runtime?.onTick(() => {
            if (this.page === 'boss' && !this.busy && (this.bossDirty || (this.runtime?.now() ?? 0) - this.bossRefreshedAt >= 5000)) {
                this.bossDirty = false;
                void this.refresh();
                return;
            }
            // Finish the local animation at its exact deadline, independent of the one-second label tick.
            if (this.alchemyAnimationUntil && !this.alchemyAnimationRemaining) {
                this.alchemyAnimationUntil = 0;
                if (this.page === 'alchemy' && this.alchemyState) {
                    this.showAlchemy(this.alchemyState);
                    this.onChanged();
                }
            }
            if (!this.alchemyAnimationUntil) return;
            const next = Math.floor((this.runtime?.now() ?? 0) / 1000);
            if (second === next || this.page !== 'alchemy' || this.busy || !this.alchemyState) return;
            second = next;
            this.showAlchemy(this.alchemyState);
            this.onChanged();
        }, signal);
    }
    async enter(): Promise<void> {
        await this.initialize();
        const grantError = this.errorText;
        // Re-read current balances; an idempotent write can return an older receipt.
        await this.refresh();
        if (grantError) { this.text = grantError; this.onChanged(); }
    }
    async refresh(): Promise<void> {
        if (this.busy) return;
        if (!this.runtime) { this.text = "gameDemo 尚未装载"; this.onChanged(); return; }
        this.busy = true;
        try {
            if (this.page === 'boss') {
                this.bossRefreshedAt = this.runtime.now();
                if (this.bossId) this.showBoss(await this.runtime.boss(this.bossId));
                else this.showBossList(await this.runtime.bosses());
                return;
            }
            if (this.page === 'guild') { this.showGuild(await this.runtime.guild()); return; }
            if (this.page === 'season') { this.showSeason(await this.runtime.season()); return; }
            if (this.page === 'hero') { this.showHero(await this.runtime.hero()); return; }
            if (this.page === 'alchemy') { this.showAlchemy(await this.runtime.alchemy()); return; }
            if (this.page === "mail") {
                const [mailbox, assets] = await Promise.all([this.runtime.mails(), this.runtime.assets()]);
                this.mails = [...mailbox.mails].reverse(); this.assets = assets;
                this.text = `金币：${assets.gold} · 邮件 ${this.mails.length} 封`;
                return;
            }
            const shop = await this.runtime.shop();
            this.showAssets(shop.assets);
            this.text += `\n今日剩余：灵草 ${GAME_DEMO_CONFIG.shop[0].dailyLimit - shop.purchased.herb} / 灵露 ${GAME_DEMO_CONFIG.shop[1].dailyLimit - shop.purchased.dew}`;
        } catch {
            this.text = "连接失败，请确认使用原生大厅入口后重试";
        } finally { this.busy = false; this.onChanged(); }
    }
    async selectPage(page: 'shop' | 'mail' | 'hero' | 'alchemy' | 'season' | 'guild' | 'boss'): Promise<void> {
        if (this.busy) return;
        this.page = page;
        this.mailPage = 0;
        await this.refresh();
    }
    /** 服务端只向房内在线参与者推送房间 sync；版本比当前快照新时在下一帧刷新。 */
    receiveBossSync(revision: number): void {
        const current = this.bossState;
        if (this.page !== 'boss' || !current || revision <= current.room.revision) return;
        this.bossDirty = true;
    }
    async enterBoss(bossId: GameDemoBossId): Promise<void> {
        if (this.busy || !this.runtime) return;
        this.busy = true;
        try {
            const result = await this.runtime.enterBoss(bossId);
            this.bossId = bossId;
            this.showBoss(result);
            this.showBoss(await this.runtime.boss(bossId));
        } catch { this.text = '进入失败，房间可能正在恢复，请稍后刷新'; }
        finally { this.busy = false; this.onChanged(); }
    }
    async attackBoss(autoAttack?: boolean): Promise<void> {
        const current = this.bossState;
        if (this.busy || !this.runtime || !current || this.bossId !== current.currentBossId) return;
        this.busy = true;
        try { this.showBoss(await this.runtime.attackBoss(current.room.bossId, current.room.runNumber, current.generation, autoAttack)); }
        catch (error) {
            const detail = error && typeof error === 'object' && 'msg' in error ? String(error.msg) : '请等待冷却或刷新恢复状态';
            this.text = `攻击未完成：${detail}`;
            this.bossDirty = true;
        } finally { this.busy = false; this.onChanged(); }
    }
    async leaveBoss(): Promise<void> {
        const current = this.bossState;
        if (this.busy || !this.runtime || !current) return;
        this.busy = true;
        try {
            const result = await this.runtime.leaveBoss(current.room.bossId, current.generation);
            this.bossId = null; this.bossState = null; this.showBossList(result);
        } catch { this.text = '离房未完成，请刷新当前选择'; this.bossDirty = true; }
        finally { this.busy = false; this.onChanged(); }
    }
    async bossSelection(): Promise<void> {
        if (this.busy) return;
        this.bossId = null;
        await this.selectPage('boss');
    }
    private showBossList(state: IGameDemoBossList): void {
        if (state.generation < this.bossGeneration) return;
        this.bossGeneration = state.generation;
        this.bossList = state;
        this.text = '三个独立共享房间 · 选择 Boss 进入\n切换后旧房间攻击不会生效';
    }
    private showBoss(state: IGameDemoBossState): void {
        if (state.generation < this.bossGeneration || state.room.bossId !== this.bossId) return;
        const prior = this.bossState;
        if (prior && prior.room.bossId === state.room.bossId && (state.room.runNumber < prior.room.runNumber || (state.room.runNumber === prior.room.runNumber && state.room.revision < prior.room.revision))) return;
        this.bossGeneration = state.generation; this.bossState = state; this.bossRefreshedAt = this.runtime?.now() ?? 0;
        const phase = { running: '战斗中', settling: '结算中', settled: '已发奖，等待下一局' }[state.room.phase];
        this.text = `${state.room.name} · 第 ${state.room.runNumber} 局 · ${phase}\n血量 ${state.room.hp}/${state.room.maxHp}\n我的伤害 ${state.myDamage} · 攻击力 ${state.heroAttack}\n冷却 ${Math.max(0, Math.ceil((state.nextAttackAt - state.serverNow) / 1000))} 秒`;
        if (state.room.respawnAt) this.text += `\n下一局剩余 ${Math.max(0, Math.ceil((state.room.respawnAt - state.serverNow) / 1000))} 秒`;
    }
    turnInvitePage(delta: number): void {
        const count = this.guildState?.invitations.length ?? 0;
        this.invitePage = Math.max(0, Math.min(Math.max(0, Math.ceil(count / 2) - 1), this.invitePage + delta));
        this.onChanged();
    }
    async guildAction(kind: 'create' | 'invite' | 'leave' | 'accept' | 'reject', inviteId = 0): Promise<void> {
        if (!this.runtime || this.busy) return;
        const target = Number(this.inviteTarget.trim());
        if (kind === 'invite' && (!Number.isSafeInteger(target) || target < 1)) {
            this.text = '请输入对方在仙盟页展示的数字玩家 ID';
            this.onChanged();
            return;
        }
        this.busy = true;
        try {
            const result = kind === 'create' ? await this.runtime.createGuild(this.guildName.trim())
                : kind === 'invite' ? await this.runtime.inviteGuild(target)
                : kind === 'leave' ? await this.runtime.leaveGuild()
                : await this.runtime.respondGuild(inviteId, kind === 'accept');
            this.showGuild(result);
            if (kind === 'invite') this.text += '\n邀请已发送，对方刷新仙盟页可查看';
        } catch (error) {
            const detail = error && typeof error === 'object' && 'msg' in error ? String(error.msg) : '请刷新后检查身份、人数或邀请';
            this.text = `仙盟操作未完成：${detail}`;
        } finally { this.busy = false; this.onChanged(); }
    }
    private showGuild(state: IGameDemoGuildState): void {
        this.guildState = state;
        this.invitePage = Math.min(this.invitePage, Math.max(0, Math.ceil(state.invitations.length / 2) - 1));
        this.text = `我的玩家 ID：${state.uid}\n`;
        if (state.guild) this.text += `${state.guild.name} · ${state.guild.members.length}/${GAME_DEMO_CONFIG.guildCapacity} 人\n盟主：${state.guild.owner}\n成员：${state.guild.members.join('、')}`;
        else this.text += `尚未加入仙盟\n待处理邀请 ${state.invitations.length} 条`;
    }
    async endSeason(): Promise<void> {
        const number = this.seasonState?.number;
        if (!this.runtime || this.busy || !number) return;
        this.busy = true;
        try { this.showSeason(await this.runtime.endSeason(number)); }
        catch { this.text = '结束活动未完成，请确认服务端开放开发入口并刷新活动'; }
        finally { this.busy = false; this.onChanged(); }
    }
    turnRankPage(delta: number): void {
        const total = this.seasonState?.top.length ?? 0;
        this.rankPage = Math.max(0, Math.min(Math.max(0, Math.ceil(total / 5) - 1), this.rankPage + delta));
        this.onChanged();
    }
    private showSeason(state: IGameDemoSeason): void {
        this.seasonState = state;
        this.turnRankPage(0);
        const phase = { running: '进行中', settling: '正在结算', settled: '已定榜，奖励投递中' }[state.phase];
        const rank = state.myRank === null ? (state.myScore ? '20 名外' : '未上榜') : `第 ${state.myRank} 名`;
        this.text = `第 ${state.number} 期活动 · ${phase}\n截止剩余 ${Math.max(0, Math.ceil((state.endsAt - state.serverNow) / 1000))} 秒（刷新更新）\n我的积分 ${state.myScore} · ${rank}\n邮件奖励 ${state.rewardedCount} 份`;
    }
    async upgrade(pill: 'normal' | 'fine', count: 1 | 10): Promise<void> {
        if (this.busy || !this.runtime) return;
        this.busy = true;
        try {
            const result = await this.runtime.upgrade(pill, count);
            this.showHero(result);
            this.text += `\n本次消耗 ${result.consumed} 枚`;
        } catch { this.text = '培养未完成，请检查丹药数量或是否已满级'; }
        finally { this.busy = false; this.onChanged(); }
    }
    async startAlchemy(count: number): Promise<void> {
        if (this.busy || !this.runtime || this.alchemyAnimationRemaining) return;
        this.busy = true;
        this.onChanged();
        try {
            const state = await this.runtime.startAlchemy(count);
            this.alchemyAnimationUntil = this.runtime.now() + GAME_DEMO_CONFIG.alchemy.animationMs;
            this.showAlchemy(state);
        }
        catch { this.text = '炼丹未完成，请检查材料数量后重试'; }
        finally { this.busy = false; this.onChanged(); }
    }
    private showHero(state: IGameDemoHeroState): void {
        this.heroState = state; this.assets = state.assets;
        this.text = `英雄等级：${state.hero.level}/${GAME_DEMO_CONFIG.heroMaxLevel}\n经验：${state.hero.exp}/${GAME_DEMO_CONFIG.heroExpPerLevel}\n攻击力：${state.hero.attack}\n经验丹：${state.assets.items.pill} · 极品丹：${state.assets.items.finePill}`;
    }
    private showAlchemy(state: IGameDemoAlchemyState): void {
        this.alchemyState = state; this.assets = state.assets;
        const batch = state.batch;
        this.text = `灵草：${state.assets.items.herb} · 灵露：${state.assets.items.dew}\n整批 ${GAME_DEMO_CONFIG.alchemy.animationMs / 1000} 秒，每炉消耗 ${GAME_DEMO_CONFIG.alchemy.herbPerBatch} 草 ${GAME_DEMO_CONFIG.alchemy.dewPerBatch} 露`;
        if (!batch) { this.text += '\n尚无炼丹批次'; return; }
        if (this.alchemyAnimationRemaining) { this.text += `\n正在炼制 ${batch.count} 炉 · ${Math.ceil(this.alchemyAnimationRemaining / 1000)} 秒`; return; }
        this.text += `\n已入包：经验丹 ${batch.pill} · 极品丹 ${batch.finePill}\n本批积分：${batch.score}`;
    }
    turnMailPage(delta: number): void {
        this.mailPage = Math.max(0, Math.min(Math.max(0, Math.ceil(this.mails.length / 5) - 1), this.mailPage + delta));
        this.onChanged();
    }
    async mailAction(mailId: number, claim: boolean): Promise<void> {
        if (this.busy || !this.runtime) return;
        this.busy = true;
        try {
            if (claim) {
                const result = await this.runtime.claimMail(mailId);
                this.mails = [...result.mailbox.mails].reverse(); this.assets = result.assets;
                this.text = `金币：${result.assets.gold} · 附件已领取`;
            } else {
                this.mails = [...(await this.runtime.readMail(mailId)).mails].reverse();
            }
        } catch { this.text = "邮件操作未完成，请刷新确认后重试"; }
        finally { this.busy = false; this.onChanged(); }
    }
    async buy(product: "herb" | "dew"): Promise<void> {
        if (this.busy || !this.runtime) return;
        this.busy = true;
        try { this.showAssets(await this.runtime.buy(product, 10)); }
        catch (error) {
            const message = error && typeof error === "object" && "msg" in error ? String(error.msg) : "请刷新状态后检查余额和限购";
            this.text = `购买未完成：${message}`;
        } finally { this.busy = false; this.onChanged(); }
    }
    async initialize(): Promise<void> {
        if (this.busy || !this.runtime) return;
        this.busy = true;
        try { this.showAssets(await this.runtime.initialize()); }
        catch { this.text = "资源初始化未完成（需服务端开放测试入口）；可刷新查询或按原操作重试"; }
        finally { this.busy = false; this.onChanged(); }
    }
    private showAssets(assets: IGameDemoAssets): void {
        this.assets = assets;
        this.text = `玩法资源 · ${assets.initialized ? "已开放" : "未开放"}\n金币：${assets.gold}\n灵草：${assets.items.herb}   灵露：${assets.items.dew}\n经验丹：${assets.items.pill}   极品丹：${assets.items.finePill}`;
    }
    get errorText(): string { return /^[^\n]*(失败|未完成|尚未装载)/.test(this.text) ? this.text : ''; }
    bossNow(): number { return (this.bossState?.serverNow ?? 0) + Math.max(0, (this.runtime?.now() ?? 0) - this.bossRefreshedAt); }
    close(): void | Promise<void> { return this.runtime?.close(); }
}
