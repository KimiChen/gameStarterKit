import {
    MAP_HEIGHT,
    MAP_WIDTH,
    PLAYER_INIT_HP,
    PLAYER_MOVE_SPEED,
    calcDamage,
    clamp,
    getSkillDef,
    normalize,
} from "@game/shared";

export interface BallMoveMutablePlayer {
    id: string;
    name: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    dirX: number;
    dirY: number;
    lastCastTick: Record<number, number>;
    level: number;
}

export interface BallMovePlayerStore<P extends BallMoveMutablePlayer = BallMoveMutablePlayer> {
    get(sessionId: string): P | undefined;
    entries(): IterableIterator<[string, P]>;
}

export interface BallMoveRandom {
    next(): number;
    nextInt(min: number, max: number): number;
}

/**
 * Position is resolved from the last accepted movement event rather than by
 * repeatedly adding a float. Live one-tick stepping and replay interval
 * stepping therefore execute the exact same expression and remain bit-equal.
 */
export interface BallMoveMotionAnchor {
    x: number;
    y: number;
    tick: number;
}

export interface BallMoveCastResult {
    casterId: string;
    skillId: number;
    targetId?: string;
    damage: number;
    diedSessionId?: string;
}

function canonicalZero(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}

export function normalizeBallMoveDirection(dirX: number, dirY: number): { x: number; y: number } {
    const direction = normalize(dirX, dirY);
    return { x: canonicalZero(direction.x), y: canonicalZero(direction.y) };
}

export function resetBallMovePlayers<P extends BallMoveMutablePlayer>(
    players: BallMovePlayerStore<P>,
    motions: Map<string, BallMoveMotionAnchor>,
    rng: BallMoveRandom,
): void {
    motions.clear();
    for (const [sessionId, player] of players.entries()) {
        player.id = sessionId;
        player.hp = PLAYER_INIT_HP;
        player.maxHp = PLAYER_INIT_HP;
        player.alive = true;
        player.dirX = 0;
        player.dirY = 0;
        player.lastCastTick = {};
        player.level = 1;
        player.x = rng.nextInt(100, Math.max(101, MAP_WIDTH - 100));
        player.y = rng.nextInt(100, Math.max(101, MAP_HEIGHT - 100));
        motions.set(sessionId, { x: player.x, y: player.y, tick: 0 });
    }
}

function resolvedCoordinate(
    anchor: number,
    direction: number,
    tickDelta: number,
    fixedStepMs: number,
    max: number,
): number {
    return clamp(
        anchor + direction * PLAYER_MOVE_SPEED * (fixedStepMs / 1000) * tickDelta,
        0,
        max,
    );
}

export function resolveBallMovePlayerAtTick(
    player: BallMoveMutablePlayer,
    motion: BallMoveMotionAnchor,
    targetTick: number,
    fixedStepMs: number,
): void {
    if (!player.alive) return;
    const tickDelta = targetTick - motion.tick;
    if (tickDelta < 0) throw new RangeError("ballMove target tick precedes motion anchor");
    player.x = resolvedCoordinate(motion.x, player.dirX, tickDelta, fixedStepMs, MAP_WIDTH);
    player.y = resolvedCoordinate(motion.y, player.dirY, tickDelta, fixedStepMs, MAP_HEIGHT);
}

/** Advance every live player directly to targetTick in O(players). */
export function advanceBallMovePlayers<P extends BallMoveMutablePlayer>(
    players: BallMovePlayerStore<P>,
    motions: ReadonlyMap<string, BallMoveMotionAnchor>,
    targetTick: number,
    fixedStepMs: number,
): void {
    for (const [sessionId, player] of players.entries()) {
        const motion = motions.get(sessionId);
        if (!motion) throw new Error(`ballMove missing motion anchor for ${sessionId}`);
        resolveBallMovePlayerAtTick(player, motion, targetTick, fixedStepMs);
    }
}

/** Apply an already wire-validated movement command at the current logical tick. */
export function applyBallMoveDirection(
    player: BallMoveMutablePlayer,
    motion: BallMoveMotionAnchor,
    dirX: number,
    dirY: number,
    acceptedTick: number,
    fixedStepMs: number,
): { x: number; y: number } {
    resolveBallMovePlayerAtTick(player, motion, acceptedTick, fixedStepMs);
    const direction = normalizeBallMoveDirection(dirX, dirY);
    motion.x = player.x;
    motion.y = player.y;
    motion.tick = acceptedTick;
    player.dirX = direction.x;
    player.dirY = direction.y;
    return direction;
}

/**
 * Apply a cast without settling the match. The caller must append the accepted
 * evidence event before it evaluates the settle condition.
 */
export function applyBallMoveCast<P extends BallMoveMutablePlayer>(
    players: BallMovePlayerStore<P>,
    rng: Pick<BallMoveRandom, "next">,
    acceptedTick: number,
    fixedStepMs: number,
    sessionId: string,
    skillId: number,
    targetId?: string,
): BallMoveCastResult | null {
    const caster = players.get(sessionId);
    if (!caster || !caster.alive) return null;
    const skill = getSkillDef(skillId);
    if (!skill) return null;
    const lastTick = caster.lastCastTick[skill.id];
    const cooldownTicks = Math.ceil(skill.cooldownMs / fixedStepMs);
    if (lastTick !== undefined && acceptedTick - lastTick < cooldownTicks) return null;

    caster.lastCastTick[skill.id] = acceptedTick;
    const damage = calcDamage(skill, caster.level, rng.next());
    const target = targetId === undefined ? undefined : players.get(targetId);
    let diedSessionId: string | undefined;
    if (target && target.alive) {
        target.hp = clamp(target.hp - damage, 0, target.maxHp);
        if (target.hp <= 0) {
            target.alive = false;
            diedSessionId = target.id;
        }
    }
    return {
        casterId: sessionId,
        skillId: skill.id,
        ...(targetId === undefined ? {} : { targetId }),
        damage,
        ...(diedSessionId === undefined ? {} : { diedSessionId }),
    };
}
