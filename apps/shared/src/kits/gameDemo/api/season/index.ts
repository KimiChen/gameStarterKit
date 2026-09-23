/** Public season snapshot. A null personal rank means absent from the displayed top 20. */
export interface GameDemoRankEntry { uid: string; score: number; rank: number; }
export interface GameDemoSeasonState {
    id: string;
    phase: 'running' | 'settling' | 'settled';
    startedAt: number;
    endsAt: number;
    serverNow: number;
    revision: number;
    top: GameDemoRankEntry[];
    myScore: number;
    myRank: number | null;
    deliveredRewards: number;
    totalRewards: number;
}
