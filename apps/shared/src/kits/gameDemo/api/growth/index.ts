/** gameDemo growth API v1。仅返回已实现的能力。 */
export { GAME_DEMO_CONFIG, gameDemoAttack, gameDemoBusinessDate } from '../../config';
export interface GameDemoStatus {
    kit: "gameDemo";
    runtime: "serverNew";
    stage: "P0";
}

export function gameDemoStatus(): GameDemoStatus {
    return { kit: "gameDemo", runtime: "serverNew", stage: "P0" };
}

export interface GameDemoAssets {
    initialized: boolean;
    revision: number;
    gold: number;
    items: { herb: number; dew: number; pill: number; finePill: number };
}

export interface GameDemoShopState {
    assets: GameDemoAssets;
    day: string;
    purchased: { herb: number; dew: number };
}

export interface GameDemoMail {
    id: string;
    title: string;
    gold: number;
    createdAt: number;
    read: boolean;
    claimed: boolean;
}
export interface GameDemoMailboxState { revision: number; mails: GameDemoMail[]; }
export interface GameDemoMailClaim { assets: GameDemoAssets; mailbox: GameDemoMailboxState; }

export interface GameDemoHero { level: number; exp: number; attack: number; revision: number; }
export interface GameDemoHeroState { assets: GameDemoAssets; hero: GameDemoHero; }
export interface GameDemoUpgradeResult extends GameDemoHeroState { consumed: number; }
