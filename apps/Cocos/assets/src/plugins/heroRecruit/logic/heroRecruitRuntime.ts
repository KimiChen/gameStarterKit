import type {
  IHeroRecruitBuyRes,
  IHeroRecruitGetCatalogRes,
} from "../../../shared/protocol/lobbyRpc/domains/heroRecruit";

/** 插件的宿主接线面；View 只能通过此 holder 拿到网络与关闭能力。 */
export interface HeroRecruitRuntime {
  getCatalog(): Promise<IHeroRecruitGetCatalogRes>;
  buy(heroId: number): Promise<IHeroRecruitBuyRes>;
  close(): void;
}

let current: HeroRecruitRuntime | null = null;

export function setHeroRecruitRuntime(runtime: HeroRecruitRuntime): () => void {
  current = runtime;
  return () => {
    if (current === runtime) current = null;
  };
}

export function getHeroRecruitRuntime(): HeroRecruitRuntime | null {
  return current;
}
