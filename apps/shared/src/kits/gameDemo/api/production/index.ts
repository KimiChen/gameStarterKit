import type { GameDemoAssets } from '../growth/index';

export interface GameDemoAlchemyBatch {
    id: string;
    configVersion: number;
    count: number;
    startedAt: number;
    /** v4+ is settled immediately (0); v1–v3 retains the saved per-unit duration. */
    durationMs: number;
    endsAt: number;
    phase: 'running' | 'claimed';
    completed: number;
    pill: number;
    finePill: number;
    refundedHerb: number;
    refundedDew: number;
    score: number;
}
export interface GameDemoAlchemyState {
    assets: GameDemoAssets;
    revision: number;
    serverNow: number;
    batch: GameDemoAlchemyBatch | null;
}
