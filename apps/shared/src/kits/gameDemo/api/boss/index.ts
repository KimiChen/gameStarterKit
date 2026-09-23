export type GameDemoBossId = 'tiger' | 'dragon' | 'phoenix';
export interface GameDemoBossDamage { uid: string; damage: number; rank: number; }
export interface GameDemoBossFighter {
    uid: string; generation: number; active: boolean;
    hp: number; maxHp: number; autoAttack: boolean;
    nextAttackAt: number; reviveAt: number;
}
export interface GameDemoBossEvent {
    sequence: number; at: number; uid: string;
    kind: 'sword' | 'counter' | 'revive'; amount: number;
}
export interface GameDemoBossBattle {
    players: GameDemoBossFighter[];
    events: GameDemoBossEvent[];
    sequence: number;
    nextCounterAt: number;
}
export interface GameDemoBossRoom {
    bossId: GameDemoBossId;
    name: string;
    runId: string;
    runNumber: number;
    hp: number;
    maxHp: number;
    phase: 'running' | 'settling' | 'settled';
    revision: number;
    ownerEpoch: number;
    respawnAt: number;
    damage: GameDemoBossDamage[];
    /** Absent in pre-combat durable receipts. */
    battle?: GameDemoBossBattle;
}
export interface GameDemoBossList {
    rooms: GameDemoBossRoom[];
    currentBossId: GameDemoBossId | null;
    generation: number;
}
export interface GameDemoBossState {
    uid?: string;
    room: GameDemoBossRoom;
    currentBossId: GameDemoBossId | null;
    generation: number;
    serverNow: number;
    nextAttackAt: number;
    heroAttack: number;
    heroRevision: number;
    myDamage: number;
    appliedDamage: number;
}
export interface GameDemoBossChanged { bossId: GameDemoBossId; runId: string; runNumber: number; revision: number; ownerEpoch: number; generation: number; }
