export interface BattleLogTextRun {
    readonly id: string;
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly color: string;
}

export interface BattleLogRound {
    readonly id: string;
    readonly number: number;
    readonly playerHp: string;
    readonly enemyHp: string;
    readonly playerLoss: string;
    readonly enemyLoss: string;
    readonly events: readonly BattleLogTextRun[];
    readonly eventHeight: number;
}

export interface BattleLogRow {
    readonly id: string;
    readonly title: string;
    readonly expanded: boolean;
    readonly height: number;
    readonly bodyHeight: number;
    readonly runs: readonly BattleLogTextRun[];
    readonly round: BattleLogRound | null;
}
