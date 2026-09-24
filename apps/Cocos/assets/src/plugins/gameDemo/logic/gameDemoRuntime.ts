import type {
  IGameDemoAlchemyState,
  IGameDemoAssets,
  IGameDemoBossList,
  IGameDemoBossState,
  IGameDemoGuildState,
  IGameDemoHeroState,
  IGameDemoHeroUpgrade,
  IGameDemoMailbox,
  IGameDemoMailClaim,
  IGameDemoSeason,
  IGameDemoShop,
} from "../../../shared/protocol/lobbyRpc/domains/gameDemo";
import type { GameDemoBossId } from "../../../shared/protocol/lobbyRpc/checks/gameDemo";

/** 插件的宿主接线面；Logic / View 只能通过此 holder 拿到网络、同步与时钟能力。 */
export interface GameDemoRuntime {
  assets(): Promise<IGameDemoAssets>;
  initialize(): Promise<IGameDemoAssets>;
  shop(): Promise<IGameDemoShop>;
  buy(product: "herb" | "dew", count: number): Promise<IGameDemoAssets>;
  mails(): Promise<IGameDemoMailbox>;
  readMail(mailId: number): Promise<IGameDemoMailbox>;
  claimMail(mailId: number): Promise<IGameDemoMailClaim>;
  hero(): Promise<IGameDemoHeroState>;
  upgrade(pill: "normal" | "fine", count: 1 | 10): Promise<IGameDemoHeroUpgrade>;
  alchemy(): Promise<IGameDemoAlchemyState>;
  startAlchemy(count: number): Promise<IGameDemoAlchemyState>;
  season(): Promise<IGameDemoSeason>;
  endSeason(number: number): Promise<IGameDemoSeason>;
  guild(): Promise<IGameDemoGuildState>;
  createGuild(name: string): Promise<IGameDemoGuildState>;
  inviteGuild(targetUid: number): Promise<IGameDemoGuildState>;
  respondGuild(inviteId: number, accept: boolean): Promise<IGameDemoGuildState>;
  leaveGuild(): Promise<IGameDemoGuildState>;
  bosses(): Promise<IGameDemoBossList>;
  boss(bossId: GameDemoBossId): Promise<IGameDemoBossState>;
  enterBoss(bossId: GameDemoBossId): Promise<IGameDemoBossState>;
  leaveBoss(bossId: GameDemoBossId, generation: number): Promise<IGameDemoBossList>;
  attackBoss(
    bossId: GameDemoBossId,
    runNumber: number,
    generation: number,
    autoAttack?: boolean,
  ): Promise<IGameDemoBossState>;
  /** 服务端提交 Boss 房间变化后按 ModSync 推送的房间版本；Logic 据此刷新。 */
  onBossSync(callback: (revision: number) => void, signal: AbortSignal): () => void;
  now(): number;
  onTick(callback: () => void, signal: AbortSignal): () => void;
  close(): void | Promise<void>;
}

let current: GameDemoRuntime | null = null;

export function setGameDemoRuntime(runtime: GameDemoRuntime): () => void {
  current = runtime;
  return () => {
    if (current === runtime) current = null;
  };
}

export function getGameDemoRuntime(): GameDemoRuntime | null {
  return current;
}
