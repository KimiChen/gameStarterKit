import type { GameDemoBossId, GameDemoBossList, GameDemoBossState, GameDemoBossChanged } from '../../../shared/kits/gameDemo/api/boss/index';
import type { GameDemoGuildState } from '../../../shared/kits/gameDemo/api/guild/index';
import type { GameDemoSeasonState } from '../../../shared/kits/gameDemo/api/season/index';
import type { GameDemoStatus, GameDemoAssets, GameDemoShopState, GameDemoMailboxState, GameDemoMailClaim } from "../../../shared/kits/gameDemo/api/growth/index";
import type { GameDemoHeroState, GameDemoUpgradeResult } from '../../../shared/kits/gameDemo/api/growth/index';
import type { GameDemoAlchemyState } from '../../../shared/kits/gameDemo/api/production/index';

export interface GameDemoRuntime {
    status(): Promise<GameDemoStatus>;
    assets(): Promise<GameDemoAssets>;
    initialize(): Promise<GameDemoAssets>;
    shop(): Promise<GameDemoShopState>;
    buy(product: "herb" | "dew", count: number): Promise<GameDemoAssets>;
    mails(): Promise<GameDemoMailboxState>;
    readMail(mailId: string): Promise<GameDemoMailboxState>;
    claimMail(mailId: string): Promise<GameDemoMailClaim>;
    hero(): Promise<GameDemoHeroState>;
    upgrade(pill: 'normal' | 'fine', count: 1 | 10): Promise<GameDemoUpgradeResult>;
    alchemy(): Promise<GameDemoAlchemyState>;
    startAlchemy(count: number): Promise<GameDemoAlchemyState>;
    finishAlchemy(batchId: string, early: boolean): Promise<GameDemoAlchemyState>;
    season(): Promise<GameDemoSeasonState>;
    endSeason(seasonId: string): Promise<GameDemoSeasonState>;
    guild(): Promise<GameDemoGuildState>;
    createGuild(name: string): Promise<GameDemoGuildState>;
    inviteGuild(targetUid: string): Promise<GameDemoGuildState>;
    respondGuild(inviteId: string, accept: boolean): Promise<GameDemoGuildState>;
    leaveGuild(): Promise<GameDemoGuildState>;
    bosses(): Promise<GameDemoBossList>;
    boss(bossId: GameDemoBossId): Promise<GameDemoBossState>;
    enterBoss(bossId: GameDemoBossId): Promise<GameDemoBossState>;
    leaveBoss(bossId: GameDemoBossId, generation: number): Promise<GameDemoBossList>;
    attackBoss(bossId: GameDemoBossId, runId: string, generation: number, autoAttack?: boolean): Promise<GameDemoBossState>;
    onBossChanged(callback: (event: GameDemoBossChanged) => void, signal: AbortSignal): () => void;
    now(): number;
    onTick(callback: () => void, signal: AbortSignal): () => void;
    close(): void | Promise<void>;
}
let current: GameDemoRuntime | null = null;
export function setGameDemoRuntime(runtime: GameDemoRuntime): () => void {
    current = runtime;
    return () => { if (current === runtime) current = null; };
}
export function getGameDemoRuntime(): GameDemoRuntime | null { return current; }
