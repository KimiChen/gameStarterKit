/** Snake V2 服务端权威世界：4096²、17 蛇、1030 食物、Star/磁铁确定性运动与 AI 独立重生。 */
import { SeededRandom, type ISnakeRunDelta, type ISnakeWorldSnapshot } from "@game/shared";
import {
    directionVector,
    nextSnakeMotionStepMilli,
    quantizeSnake,
    snakeBodyScale,
    snakeMicroToWire,
    SNAKE_AI_LINEUP,
    SNAKE_RULESET,
    type SnakeRuleset,
} from "@game/shared/gameplays/snake/ruleset";
import {
    aiDeathWreckValues,
    boostAccepted,
    boostLengthCost,
    compareSnakeRank,
    directionFromInput,
    eatDistance,
    headRadius,
    normalizeDegrees,
    snakeCollisionDistance,
    stepDistance,
    turnTowards,
    visiblePointCount,
    wallBounds,
    type SnakeRankEntry,
} from "./rules";

export interface SnakePoint { x: number; y: number }

export interface SnakeBody {
    readonly id: string;
    readonly entityId: number;
    readonly isAi: boolean;
    readonly aiLevel: number | null;
    readonly name: string;
    skinId: number;
    alive: boolean;
    score: number;
    killCount: number;
    deathCount: number;
    length: number;
    boostDebt: number;
    direction: number;
    targetDirection: number;
    boostIntent: boolean;
    boostActive: boolean;
    aiBoostTicksLeft: number;
    points: SnakePoint[];
    protectUntilTick: number;
    magnetUntilTick: number;
    respawnAtTick: number;
    lastAcceptedSeq: number;
    lastScoreTick: number;
    joinedTick: number;
}

export type FoodKind = 0 | 1;

interface MovingEntity {
    xMicro: number;
    yMicro: number;
    directionMilliX: number;
    directionMilliY: number;
    headingDeg: number;
    remainingDirectionTicks: number;
    distanceMilliRemainder: number;
    readonly rng: SeededRandom;
}

export interface SnakeFood {
    readonly id: number;
    readonly kind: FoodKind;
    readonly variant: number;
    x: number;
    y: number;
    readonly motion: MovingEntity | null;
}

export interface SnakeWreck {
    readonly id: number;
    value: number;
    readonly kind: 0 | 1;
    readonly variant: number;
    readonly sourceSkinId?: number;
    readonly x: number;
    readonly y: number;
}

export interface SnakeTool {
    readonly id: number;
    readonly toolId: 10001;
    x: number;
    y: number;
    readonly spawnTick: number;
    readonly expireTick: number;
    readonly motion: MovingEntity;
}

export interface SnakeSpawnPoint { readonly x: number; readonly y: number; readonly direction: number }

export interface SnakeMagnetGateRun {
    readonly state: string;
    readonly length: number;
}

export interface SnakeMagnetTriggerRecord {
    readonly relativeTick: number;
    readonly ordinal: number;
    readonly unconditional: boolean;
    readonly spawned: boolean;
}

export interface SnakeWorldEvents {
    onDeath?(snake: SnakeBody, killerId: string | null, cause: "wall" | "collision" | "forced"): void;
    onEat?(snake: SnakeBody, kind: "dot" | "star" | "wreck", value: number): void;
    onMagnetPickup?(snake: SnakeBody, tool: SnakeTool): void;
}

class SpatialGrid {
    private readonly cells = new Map<string, number[]>();

    constructor(private readonly cellSize: number) {}

    private key(x: number, y: number): string {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
    }

    rebuild(snakes: readonly SnakeBody[]): void {
        this.cells.clear();
        for (let index = 0; index < snakes.length; index += 1) {
            const snake = snakes[index];
            if (!snake.alive) continue;
            this.insert(snake.points[0], index);
            for (let pointIndex = 2; pointIndex < snake.points.length; pointIndex += 2) {
                this.insert(snake.points[pointIndex], index);
            }
        }
    }

    private insert(point: SnakePoint, snakeIndex: number): void {
        const key = this.key(point.x, point.y);
        const list = this.cells.get(key);
        if (list) list.push(snakeIndex);
        else this.cells.set(key, [snakeIndex]);
    }

    queryNeighbors(x: number, y: number): readonly number[] {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const result = new Set<number>();
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const list = this.cells.get(`${cx + dx},${cy + dy}`);
                if (list) for (const index of list) result.add(index);
            }
        }
        return [...result].sort((left, right) => left - right);
    }
}

export interface SnakeWorldOptions {
    readonly matchSeed: number;
    readonly playingStartedTick?: number;
    readonly events?: SnakeWorldEvents;
    readonly ruleset?: SnakeRuleset;
    readonly aiSkinPool?: readonly number[];
}

export class SnakeWorld {
    readonly ruleset: SnakeRuleset;
    readonly playingStartedTick: number;
    readonly movementStartTick: number;
    /** Endless 明确没有可比较的 endTick。 */
    readonly endTick: null = null;
    tick = 0;
    readonly snakes: SnakeBody[] = [];
    readonly magnetTriggers: SnakeMagnetTriggerRecord[] = [];
    private readonly snakeById = new Map<string, SnakeBody>();
    private readonly foods = new Map<number, SnakeFood>();
    private readonly wrecks = new Map<number, SnakeWreck>();
    private readonly tools = new Map<number, SnakeTool>();
    private readonly pendingAiRespawns: SnakeBody[] = [];
    private readonly fakeRanks: Array<{ id: string; name: string; score: number }> = [];
    private nextFoodId = 1;
    private nextWreckId = 1;
    private nextToolId = 1;
    private nextSnakeEntityId = 1;
    private nextAiOrdinal = 0;
    private magnetTriggerOrdinal = 0;
    private readonly matchSeed: number;
    private readonly events: SnakeWorldEvents;
    private readonly grid: SpatialGrid;
    private readonly rngSpawn: SeededRandom;
    private readonly rngFood: SeededRandom;
    private readonly rngToolPlacement: SeededRandom;
    private readonly rngFakeRank: SeededRandom;
    private readonly rngAiSkin: SeededRandom;
    readonly rngAi: SeededRandom;
    private readonly aiSkinCycle: number[];
    private aiSkinCursor = 0;

    constructor(options: SnakeWorldOptions) {
        this.ruleset = options.ruleset ?? SNAKE_RULESET;
        this.matchSeed = options.matchSeed >>> 0;
        this.playingStartedTick = options.playingStartedTick ?? 0;
        this.movementStartTick = this.playingStartedTick + this.ruleset.countdownTicks;
        this.events = options.events ?? {};
        this.grid = new SpatialGrid(this.ruleset.broadphaseGridCell);
        this.rngSpawn = SeededRandom.stream(this.matchSeed, "snake.spawn");
        this.rngFood = SeededRandom.stream(this.matchSeed, "snake.food");
        this.rngToolPlacement = SeededRandom.stream(this.matchSeed, "snake.tool.spawn");
        this.rngFakeRank = SeededRandom.stream(this.matchSeed, "snake.fake-rank");
        this.rngAiSkin = SeededRandom.stream(this.matchSeed, "snake.ai.skin");
        this.rngAi = SeededRandom.stream(this.matchSeed, "snake.ai");
        this.aiSkinCycle = this.shuffleAiSkins(options.aiSkinPool ?? [1]);
        for (let index = 0; index < this.ruleset.dotTarget; index += 1) this.spawnFood(0);
        for (let index = 0; index < this.ruleset.starTarget; index += 1) this.spawnFood(1);
        for (let index = 0; index < this.ruleset.fakeSnakeCount; index += 1) {
            this.fakeRanks.push({
                id: `rank-fake-${index + 1}`,
                name: `玩家${String(index + 1).padStart(2, "0")}`,
                score: this.rngFakeRank.nextInt(this.ruleset.fakeSnakeInitMin, this.ruleset.fakeSnakeInitMaxExclusive),
            });
        }
    }

    private shuffleAiSkins(pool: readonly number[]): number[] {
        const values = [...new Set(pool.filter((id) => Number.isSafeInteger(id) && id > 0))];
        if (values.length === 0) values.push(1);
        for (let index = values.length - 1; index > 0; index -= 1) {
            const other = this.rngAiSkin.nextInt(0, index + 1);
            const value = values[index];
            values[index] = values[other];
            values[other] = value;
        }
        return values;
    }

    private nextAiSkin(): number {
        const usedByHumans = new Set(this.snakes.filter((snake) => !snake.isAi).map((snake) => snake.skinId));
        for (let attempt = 0; attempt < this.aiSkinCycle.length; attempt += 1) {
            const skinId = this.aiSkinCycle[this.aiSkinCursor % this.aiSkinCycle.length];
            this.aiSkinCursor += 1;
            if (!usedByHumans.has(skinId)) return skinId;
        }
        const skinId = this.aiSkinCycle[this.aiSkinCursor % this.aiSkinCycle.length];
        this.aiSkinCursor += 1;
        return skinId;
    }

    addPlayerSnake(sessionId: string, name: string, skinId = 1): SnakeBody {
        return this.createSnake(sessionId, false, null, name, skinId);
    }

    addAiSnake(aiLevel = 401): SnakeBody {
        this.nextAiOrdinal += 1;
        return this.createSnake(`ai-${this.nextAiOrdinal}`, true, aiLevel, `AI-${this.nextAiOrdinal}`, this.nextAiSkin());
    }

    addInitialAiLineup(): void {
        for (const entry of SNAKE_AI_LINEUP) {
            for (let count = 0; count < entry.count; count += 1) this.addAiSnake(entry.level);
        }
    }

    private createSnake(id: string, isAi: boolean, aiLevel: number | null, name: string, skinId: number): SnakeBody {
        const spawn = this.pickSpawnPoint();
        const snake: SnakeBody = {
            id,
            entityId: this.nextSnakeEntityId++,
            isAi,
            aiLevel,
            name,
            skinId,
            alive: true,
            score: 0,
            killCount: 0,
            deathCount: 0,
            length: this.ruleset.spawnLength,
            boostDebt: 0,
            direction: spawn.direction,
            targetDirection: spawn.direction,
            boostIntent: false,
            boostActive: false,
            aiBoostTicksLeft: 0,
            points: this.buildInitialBody(spawn, this.ruleset.spawnLength),
            // 半开区间从下一次真实 movement tick 开始；准备期不得提前消耗首次保护。
            protectUntilTick: Math.max(this.tick + 1, this.movementStartTick + 1)
                + this.ruleset.spawnProtectionTicks,
            magnetUntilTick: 0,
            respawnAtTick: 0,
            lastAcceptedSeq: 0,
            lastScoreTick: this.tick,
            joinedTick: this.tick,
        };
        this.snakes.push(snake);
        this.snakeById.set(id, snake);
        return snake;
    }

    private buildInitialBody(spawn: SnakeSpawnPoint, length: number): SnakePoint[] {
        const bounds = wallBounds(length);
        const clamp = (value: number, half: number): number => quantizeSnake(Math.max(-half, Math.min(half, value)));
        const points: SnakePoint[] = [{ x: clamp(spawn.x, bounds.halfWidth), y: clamp(spawn.y, bounds.halfHeight) }];
        const back = directionVector(normalizeDegrees(spawn.direction + 180));
        const count = Math.min(this.ruleset.maxBodyPoints, Math.max(this.ruleset.initialPointCount, visiblePointCount(length)));
        for (let index = 1; index < count; index += 1) {
            points.push({
                x: clamp(spawn.x + back.x * this.ruleset.pointSpacing * index, bounds.halfWidth),
                y: clamp(spawn.y + back.y * this.ruleset.pointSpacing * index, bounds.halfHeight),
            });
        }
        return points;
    }

    get(id: string): SnakeBody | undefined { return this.snakeById.get(id); }
    foodList(): readonly SnakeFood[] { return [...this.foods.values()]; }
    wreckList(): readonly SnakeWreck[] { return [...this.wrecks.values()]; }
    toolList(): readonly SnakeTool[] { return [...this.tools.values()]; }
    get pendingAiRespawnCount(): number { return this.pendingAiRespawns.length; }
    get nextToolEntityId(): number { return this.nextToolId; }

    aiTargetCount(humanSeatCount: number): number {
        return Math.max(0, this.ruleset.aiFillTarget - humanSeatCount);
    }

    countAi(): number { return this.snakes.reduce((count, snake) => count + (snake.isAi ? 1 : 0), 0); }
    countHumans(): number { return this.snakes.reduce((count, snake) => count + (!snake.isAi ? 1 : 0), 0); }
    countActiveSnakes(): number { return this.snakes.reduce((count, snake) => count + (snake.alive ? 1 : 0), 0); }

    /** 真人加入只淘汰一条 level-401 AI；ID、位置和 motion RNG 都不被复用。 */
    cullAiForJoin(): SnakeBody | null {
        const candidates = this.snakes.filter((snake) => snake.isAi && snake.aiLevel === 401);
        if (candidates.length === 0) return null;
        candidates.sort((left, right) => Number(right.alive) - Number(left.alive)
            || left.score - right.score || left.joinedTick - right.joinedTick || left.entityId - right.entityId);
        const victim = candidates[0];
        // 入座让位是 roster 退休，不是玩法死亡：不增加 deathCount、不产残骸、不发死亡事件。
        victim.alive = false;
        victim.boostActive = false;
        victim.boostIntent = false;
        victim.magnetUntilTick = 0;
        this.removeSnakeEntity(victim);
        return victim;
    }

    removePlayerSnake(sessionId: string): void {
        const snake = this.snakeById.get(sessionId);
        if (!snake || snake.isAi) return;
        snake.alive = false;
        snake.boostActive = false;
        snake.boostIntent = false;
        snake.magnetUntilTick = 0;
        this.removeSnakeEntity(snake);
    }

    private removeSnakeEntity(snake: SnakeBody): void {
        const pending = this.pendingAiRespawns.indexOf(snake);
        if (pending >= 0) this.pendingAiRespawns.splice(pending, 1);
        this.snakeById.delete(snake.id);
        const index = this.snakes.indexOf(snake);
        if (index >= 0) this.snakes.splice(index, 1);
    }

    applyInput(id: string, dirX: number, dirY: number, boost: boolean, seq: number): boolean {
        const snake = this.snakeById.get(id);
        if (!snake || snake.isAi || !snake.alive || seq <= snake.lastAcceptedSeq) return false;
        snake.lastAcceptedSeq = seq;
        this.applyIntent(snake, dirX, dirY, boost);
        return true;
    }

    applyAiIntent(id: string, dirX: number, dirY: number, boost: boolean): void {
        const snake = this.snakeById.get(id);
        if (!snake || !snake.isAi || !snake.alive) return;
        this.applyIntent(snake, dirX, dirY, boost);
    }

    private applyIntent(snake: SnakeBody, dirX: number, dirY: number, boost: boolean): void {
        const direction = directionFromInput(dirX, dirY);
        if (direction !== null) snake.targetDirection = direction;
        snake.boostIntent = boost;
    }

    disconnectHuman(id: string): void {
        const snake = this.snakeById.get(id);
        if (!snake || snake.isAi) return;
        snake.boostIntent = false;
        snake.boostActive = false;
    }

    /** fixed-step：trigger 先读取调用方传入的“上一 tick 已提交”run 快照。Endless 永远返回 false。 */
    step(gateRuns: readonly SnakeMagnetGateRun[] = []): false {
        this.tick += 1;
        this.expireTools();
        this.triggerMagnetWave(gateRuns);
        this.moveWorldEntities();
        if (this.tick > this.movementStartTick) {
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                snake.direction = turnTowards(snake.direction, snake.targetDirection, this.ruleset.maxTurnDegPerTick);
                snake.boostActive = boostAccepted(snake.boostIntent, snake.alive, snake.length);
            }
            const headOnPairs = this.collectHeadOnPairs();
            for (const snake of this.snakes) if (snake.alive) this.moveSnake(snake);
            for (const snake of this.snakes) if (snake.alive && snake.boostActive) this.applyBoostCost(snake);
            this.grid.rebuild(this.snakes);
            this.resolveCollisions(headOnPairs);
            this.resolveToolPickups();
            this.resolveFoodAndWreckPickups();
            this.resolveAiRespawns();
            this.replenishFood();
        }
        if ((this.tick - this.playingStartedTick) > 0 && (this.tick - this.playingStartedTick) % 20 === 0) {
            this.stepFakeRanks();
        }
        return false;
    }

    private triggerMagnetWave(gateRuns: readonly SnakeMagnetGateRun[]): void {
        const relativeTick = this.tick - this.playingStartedTick;
        const unconditional = relativeTick === this.ruleset.magnetFirstWaveTick
            || relativeTick === this.ruleset.magnetSecondWaveTick
            || relativeTick === this.ruleset.magnetThirdWaveTick;
        const recurring = relativeTick >= this.ruleset.magnetRecurringFirstTick
            && (relativeTick - this.ruleset.magnetRecurringFirstTick) % this.ruleset.magnetRecurringTicks === 0;
        if (!unconditional && !recurring) return;
        this.magnetTriggerOrdinal += 1;
        const eligible = unconditional || gateRuns.some((run) => this.isMagnetGateEligible(run));
        const canSpawn = eligible && this.tools.size === 0;
        this.magnetTriggers.push({
            relativeTick,
            ordinal: this.magnetTriggerOrdinal,
            unconditional,
            spawned: canSpawn,
        });
        if (!canSpawn) return;
        for (let count = 0; count < this.ruleset.magnetWaveCount; count += 1) this.spawnTool();
    }

    private isMagnetGateEligible(run: SnakeMagnetGateRun): boolean {
        return (run.state === "active" || run.state === "deadPresentation" || run.state === "reliveOffering"
            || run.state === "pendingRelive" || run.state === "reliveSpawning" || run.state === "reliveCommitting"
            || run.state === "reliveReady")
            && Number.isFinite(run.length) && run.length < this.ruleset.magnetGateMaxLengthExclusive;
    }

    private expireTools(): void {
        for (const [id, tool] of this.tools) if (this.tick >= tool.expireTick) this.tools.delete(id);
    }

    private spawnTool(): void {
        if (this.tools.size >= this.ruleset.magnetMaxAlive) return;
        const id = this.nextToolId++;
        const point = this.placeEntity(this.ruleset.magnetRadius, this.rngToolPlacement, id);
        const motion = this.createMotion("magnet", id, point.x, point.y);
        this.tools.set(id, {
            id,
            toolId: this.ruleset.magnetToolId as 10001,
            x: point.x,
            y: point.y,
            spawnTick: this.tick,
            expireTick: this.tick + this.ruleset.magnetExpireTicks,
            motion,
        });
    }

    private createMotion(kind: "star" | "magnet", id: number, x: number, y: number): MovingEntity {
        const rng = SeededRandom.stream(this.matchSeed, `snake.motion.${kind}:${id}`);
        const headingDeg = rng.nextInt(0, 360);
        const holdTicks = rng.nextInt(this.ruleset.motionHoldMinTicks, this.ruleset.motionHoldMaxExclusive);
        const direction = directionVector(headingDeg);
        return {
            xMicro: Math.round(x * 1_000_000),
            yMicro: Math.round(y * 1_000_000),
            directionMilliX: Math.round(direction.x * 1000),
            directionMilliY: Math.round(direction.y * 1000),
            headingDeg,
            remainingDirectionTicks: holdTicks,
            distanceMilliRemainder: 0,
            rng,
        };
    }

    private moveWorldEntities(): void {
        for (const food of this.foods.values()) {
            if (food.kind === 1 && food.motion) this.moveEntity(food, food.motion, this.ruleset.starRadius);
        }
        for (const tool of this.tools.values()) this.moveEntity(tool, tool.motion, this.ruleset.magnetRadius);
    }

    private moveEntity(entity: { x: number; y: number }, motion: MovingEntity, radius: number): void {
        if (motion.remainingDirectionTicks === 0) {
            const headingDeg = motion.rng.nextInt(0, 360);
            const holdTicks = motion.rng.nextInt(this.ruleset.motionHoldMinTicks, this.ruleset.motionHoldMaxExclusive);
            const direction = directionVector(headingDeg);
            motion.headingDeg = headingDeg;
            motion.directionMilliX = Math.round(direction.x * 1000);
            motion.directionMilliY = Math.round(direction.y * 1000);
            motion.remainingDirectionTicks = holdTicks;
        }
        const distance = nextSnakeMotionStepMilli(motion.distanceMilliRemainder);
        motion.distanceMilliRemainder = distance.remainder;
        let nextX = motion.xMicro + motion.directionMilliX * distance.stepMilli;
        let nextY = motion.yMicro + motion.directionMilliY * distance.stepMilli;
        const limitX = Math.round((this.ruleset.worldWidth / 2 - radius) * 1_000_000);
        const limitY = Math.round((this.ruleset.worldHeight / 2 - radius) * 1_000_000);
        let reflected = false;
        if (nextX > limitX) {
            nextX = limitX - (nextX - limitX);
            motion.directionMilliX = -motion.directionMilliX;
            reflected = true;
        } else if (nextX < -limitX) {
            nextX = -limitX + (-limitX - nextX);
            motion.directionMilliX = -motion.directionMilliX;
            reflected = true;
        }
        if (nextY > limitY) {
            nextY = limitY - (nextY - limitY);
            motion.directionMilliY = -motion.directionMilliY;
            reflected = true;
        } else if (nextY < -limitY) {
            nextY = -limitY + (-limitY - nextY);
            motion.directionMilliY = -motion.directionMilliY;
            reflected = true;
        }
        motion.xMicro = nextX;
        motion.yMicro = nextY;
        entity.x = snakeMicroToWire(nextX);
        entity.y = snakeMicroToWire(nextY);
        if (reflected) {
            motion.headingDeg = normalizeDegrees((Math.atan2(motion.directionMilliY, motion.directionMilliX) * 180) / Math.PI);
            motion.remainingDirectionTicks = motion.rng.nextInt(
                this.ruleset.motionHoldMinTicks,
                this.ruleset.motionHoldMaxExclusive,
            );
        } else {
            motion.remainingDirectionTicks -= 1;
        }
    }

    private moveSnake(snake: SnakeBody): void {
        const distance = stepDistance(snake.boostActive);
        const direction = directionVector(snake.direction);
        const head = snake.points[0];
        snake.points.unshift({
            x: quantizeSnake(head.x + direction.x * distance),
            y: quantizeSnake(head.y + direction.y * distance),
        });
        const maxPoints = Math.min(this.ruleset.maxBodyPoints, Math.max(this.ruleset.initialPointCount, visiblePointCount(snake.length)));
        while (snake.points.length > maxPoints) snake.points.pop();
    }

    private applyBoostCost(snake: SnakeBody): void {
        const result = boostLengthCost(snake.boostDebt);
        snake.boostDebt = result.debt;
        if (result.cost <= 0) return;
        snake.length = Math.max(this.ruleset.spawnLength, snake.length - result.cost);
        for (let index = 0; index < result.cost; index += 1) {
            const tail = snake.points[snake.points.length - 1];
            this.spawnWreck(tail.x, tail.y, this.ruleset.boostWreckValue, 0, snake.skinId);
        }
    }

    private collectHeadOnPairs(): Array<[SnakeBody, SnakeBody]> {
        const result: Array<[SnakeBody, SnakeBody]> = [];
        const maxStep = stepDistance(true);
        for (let first = 0; first < this.snakes.length; first += 1) {
            const a = this.snakes[first];
            if (!a.alive || this.tick < a.protectUntilTick) continue;
            for (let second = first + 1; second < this.snakes.length; second += 1) {
                const b = this.snakes[second];
                if (!b.alive || this.tick < b.protectUntilTick) continue;
                const dx = b.points[0].x - a.points[0].x;
                const dy = b.points[0].y - a.points[0].y;
                if (Math.hypot(dx, dy) > maxStep * 2 + snakeCollisionDistance(a.length, b.length)) continue;
                const dirA = directionVector(a.direction);
                const dirB = directionVector(b.direction);
                if ((dirA.x * dx + dirA.y * dy) > 0 && (dirB.x * -dx + dirB.y * -dy) > 0
                    && (dirA.x * dirB.x + dirA.y * dirB.y) < -0.5) result.push([a, b]);
            }
        }
        return result;
    }

    private resolveCollisions(preMovePairs: Array<[SnakeBody, SnakeBody]>): void {
        const deaths: Array<{ snake: SnakeBody; killer: SnakeBody | null; cause: "wall" | "collision" }> = [];
        const headPairs = [...preMovePairs];
        const pairKeys = new Set<string>();
        for (const [a, b] of headPairs) {
            pairKeys.add(`${a.id}|${b.id}`);
            pairKeys.add(`${b.id}|${a.id}`);
        }
        for (const snake of this.snakes) {
            if (!snake.alive) continue;
            const head = snake.points[0];
            const bounds = wallBounds(snake.length);
            if (Math.abs(head.x) > bounds.halfWidth || Math.abs(head.y) > bounds.halfHeight) {
                deaths.push({ snake, killer: null, cause: "wall" });
                continue;
            }
            if (this.tick < snake.protectUntilTick) continue;
            const selfSkip = Math.max(4, Math.ceil((2 * this.ruleset.bodyWidth) / this.ruleset.pointSpacing));
            const selfDistance = snakeCollisionDistance(snake.length, snake.length);
            if (snake.points.slice(selfSkip).some((point) => this.dist(head, point) < selfDistance)) {
                deaths.push({ snake, killer: null, cause: "collision" });
                continue;
            }
            let killer: SnakeBody | null = null;
            let bestDistance = Infinity;
            for (const otherIndex of this.grid.queryNeighbors(head.x, head.y)) {
                const other = this.snakes[otherIndex];
                if (!other || other === snake || !other.alive || this.tick < other.protectUntilTick
                    || pairKeys.has(`${snake.id}|${other.id}`)) continue;
                const threshold = snakeCollisionDistance(snake.length, other.length);
                for (let pointIndex = 1; pointIndex < other.points.length; pointIndex += 1) {
                    const distance = this.dist(head, other.points[pointIndex]);
                    if (distance < threshold && distance < bestDistance) {
                        killer = other;
                        bestDistance = distance;
                    }
                }
            }
            if (killer) deaths.push({ snake, killer, cause: "collision" });
        }
        for (const [a, b] of headPairs) {
            if (a.length < b.length) deaths.push({ snake: a, killer: b, cause: "collision" });
            else if (b.length < a.length) deaths.push({ snake: b, killer: a, cause: "collision" });
            else {
                deaths.push({ snake: a, killer: b, cause: "collision" });
                deaths.push({ snake: b, killer: a, cause: "collision" });
            }
        }
        for (const death of deaths) if (death.snake.alive) this.killSnake(death.snake, death.killer, death.cause);
    }

    private resolveToolPickups(): void {
        const orderedSnakes = this.snakes.filter((snake) => snake.alive)
            .sort((left, right) => left.entityId - right.entityId);
        for (const [toolId, tool] of this.tools) {
            let winner: SnakeBody | null = null;
            for (const snake of orderedSnakes) {
                if (this.dist(snake.points[0], tool) < eatDistance(this.ruleset.magnetRadius, snake.length, false)) {
                    winner = snake;
                    break;
                }
            }
            if (!winner) continue;
            this.tools.delete(toolId);
            winner.magnetUntilTick = Math.max(winner.magnetUntilTick, this.tick + this.ruleset.magnetEffectTicks);
            this.events.onMagnetPickup?.(winner, tool);
        }
    }

    private resolveFoodAndWreckPickups(): void {
        const claims = new Map<string, { snake: SnakeBody; distance: number }>();
        const claim = (key: string, x: number, y: number, radius: number): void => {
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                const distance = this.dist(snake.points[0], { x, y });
                const magnet = this.tick < snake.magnetUntilTick;
                if (distance >= eatDistance(radius, snake.length, magnet)) continue;
                const previous = claims.get(key);
                if (!previous || distance < previous.distance
                    || (distance === previous.distance && snake.entityId < previous.snake.entityId)) {
                    claims.set(key, { snake, distance });
                }
            }
        };
        for (const food of this.foods.values()) claim(`f:${food.id}`, food.x, food.y,
            food.kind === 0 ? this.ruleset.dotRadius : this.ruleset.starRadius);
        for (const wreck of this.wrecks.values()) claim(`w:${wreck.id}`, wreck.x, wreck.y, this.ruleset.wreckRadius);
        for (const [key, winner] of [...claims.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
            if (!winner.snake.alive) continue;
            const [kind, rawId] = key.split(":");
            const id = Number(rawId);
            if (kind === "f") {
                const food = this.foods.get(id);
                if (!food) continue;
                winner.snake.length = Math.min(this.ruleset.maxLength, winner.snake.length
                    + (food.kind === 0 ? this.ruleset.dotGrowth : this.ruleset.starGrowth));
                const score = food.kind === 0 ? this.ruleset.dotScore : this.ruleset.starScore;
                this.addScore(winner.snake, score);
                this.foods.delete(id);
                this.events.onEat?.(winner.snake, food.kind === 0 ? "dot" : "star", score);
            } else {
                const wreck = this.wrecks.get(id);
                if (!wreck) continue;
                winner.snake.length = Math.min(this.ruleset.maxLength, winner.snake.length + wreck.value);
                this.addScore(winner.snake, wreck.value);
                this.wrecks.delete(id);
                this.events.onEat?.(winner.snake, "wreck", wreck.value);
            }
        }
    }

    private resolveAiRespawns(): void {
        for (let index = 0; index < this.pendingAiRespawns.length; index += 1) {
            const snake = this.pendingAiRespawns[index];
            if (this.tick < snake.respawnAtTick) continue;
            const spawn = this.tryPickSpawnPoint();
            if (!spawn) continue;
            this.pendingAiRespawns.splice(index, 1);
            index -= 1;
            snake.alive = true;
            snake.length = this.ruleset.spawnLength;
            snake.boostDebt = 0;
            snake.direction = spawn.direction;
            snake.targetDirection = spawn.direction;
            snake.boostIntent = false;
            snake.boostActive = false;
            snake.aiBoostTicksLeft = 0;
            snake.points = this.buildInitialBody(spawn, snake.length);
            snake.protectUntilTick = this.tick + 1 + this.ruleset.spawnProtectionTicks;
            snake.magnetUntilTick = 0;
            snake.respawnAtTick = 0;
        }
    }

    tryPickHumanReliveSpawn(): SnakeSpawnPoint | null { return this.tryPickSpawnPoint(); }

    reviveHumanAt(
        id: string,
        spawn: SnakeSpawnPoint,
        snapshot: { readonly length: number; readonly score: number; readonly killCount: number },
        protectStartTick: number,
    ): SnakeBody | null {
        const snake = this.snakeById.get(id);
        if (!snake || snake.isAi || snake.alive) return null;
        snake.alive = true;
        snake.length = Math.min(this.ruleset.maxLength, Math.max(this.ruleset.spawnLength, snapshot.length));
        snake.score = Math.max(0, snapshot.score);
        snake.killCount = Math.max(0, snapshot.killCount);
        snake.boostDebt = 0;
        snake.direction = spawn.direction;
        snake.targetDirection = spawn.direction;
        snake.boostIntent = false;
        snake.boostActive = false;
        snake.points = this.buildInitialBody(spawn, snake.length);
        snake.protectUntilTick = protectStartTick + this.ruleset.reliveProtectionTicks;
        snake.magnetUntilTick = 0;
        snake.respawnAtTick = 0;
        return snake;
    }

    forceKill(id: string): boolean {
        const snake = this.snakeById.get(id);
        if (!snake || !snake.alive) return false;
        this.killSnake(snake, null, "forced");
        return true;
    }

    private killSnake(
        snake: SnakeBody,
        killer: SnakeBody | null,
        cause: "wall" | "collision" | "forced",
        suppressRespawn = false,
    ): void {
        if (!snake.alive) return;
        snake.alive = false;
        snake.deathCount += 1;
        snake.boostActive = false;
        snake.boostIntent = false;
        snake.magnetUntilTick = 0;
        if (killer && killer !== snake) killer.killCount += 1;
        if (snake.isAi) {
            const values = aiDeathWreckValues(snake.score, Math.max(1, snake.points.length));
            for (let index = 0; index < values.length; index += 1) {
                const pointIndex = Math.min(snake.points.length - 1,
                    Math.floor((index + 0.5) * snake.points.length / values.length));
                const point = snake.points[Math.max(0, pointIndex)];
                this.spawnWreck(point.x, point.y, values[index], 1, snake.skinId);
            }
            if (!suppressRespawn) {
                snake.respawnAtTick = this.tick + this.ruleset.aiRespawnDelayTicks;
                this.pendingAiRespawns.push(snake);
            }
        } else {
            snake.respawnAtTick = 0;
        }
        this.events.onDeath?.(snake, killer?.id ?? null, cause);
    }

    private addScore(snake: SnakeBody, delta: number): void {
        if (delta <= 0) return;
        snake.score = quantizeSnake(snake.score + delta);
        snake.lastScoreTick = this.tick;
    }

    private spawnFood(kind: FoodKind): void {
        const radius = kind === 0 ? this.ruleset.dotRadius : this.ruleset.starRadius;
        const id = this.nextFoodId++;
        const point = this.placeEntity(radius, this.rngFood, id);
        this.foods.set(id, {
            id,
            kind,
            variant: this.rngFood.nextInt(1, 8),
            x: point.x,
            y: point.y,
            motion: kind === 1 ? this.createMotion("star", id, point.x, point.y) : null,
        });
    }

    private spawnWreck(x: number, y: number, value: number, kind: 0 | 1, sourceSkinId?: number): void {
        const normalized = quantizeSnake(value);
        if (normalized <= 0) return;
        if (this.wrecks.size >= this.ruleset.wreckRoomCap) {
            const first = this.wrecks.values().next().value as SnakeWreck | undefined;
            if (first) first.value = quantizeSnake(first.value + normalized);
            return;
        }
        const id = this.nextWreckId++;
        this.wrecks.set(id, {
            id,
            value: normalized,
            kind,
            variant: ((id - 1) % 7) + 1,
            ...(sourceSkinId === undefined ? {} : { sourceSkinId }),
            x: quantizeSnake(x),
            y: quantizeSnake(y),
        });
    }

    private replenishFood(): void {
        let budget = this.ruleset.foodReplenishPerTick;
        while (this.foodCount(0) < this.ruleset.dotTarget && budget > 0) { this.spawnFood(0); budget -= 1; }
        while (this.foodCount(1) < this.ruleset.starTarget && budget > 0) { this.spawnFood(1); budget -= 1; }
    }

    private foodCount(kind: FoodKind): number {
        let count = 0;
        for (const food of this.foods.values()) if (food.kind === kind) count += 1;
        return count;
    }

    private pickSpawnPoint(): SnakeSpawnPoint {
        return this.tryPickSpawnPoint() ?? { x: 0, y: 0, direction: 90 };
    }

    private tryPickSpawnPoint(): SnakeSpawnPoint | null {
        const bounds = wallBounds(this.ruleset.spawnLength);
        const safe = this.ruleset.spawnSafeDistance;
        for (let attempt = 0; attempt < this.ruleset.foodSpawnMaxAttempts; attempt += 1) {
            const x = quantizeSnake(this.rngSpawn.next() * (bounds.halfWidth - safe) * 2 - (bounds.halfWidth - safe));
            const y = quantizeSnake(this.rngSpawn.next() * (bounds.halfHeight - safe) * 2 - (bounds.halfHeight - safe));
            if (this.snakes.some((snake) => snake.alive && this.dist({ x, y }, snake.points[0]) < safe)) continue;
            return { x, y, direction: normalizeDegrees((Math.atan2(-y, -x) * 180) / Math.PI) };
        }
        return null;
    }

    private placeEntity(radius: number, rng: SeededRandom, salt: number): { readonly x: number; readonly y: number } {
        const halfW = this.ruleset.worldWidth / 2 - radius;
        const halfH = this.ruleset.worldHeight / 2 - radius;
        for (let attempt = 0; attempt < this.ruleset.foodSpawnMaxAttempts; attempt += 1) {
            const x = quantizeSnake(rng.next() * halfW * 2 - halfW);
            const y = quantizeSnake(rng.next() * halfH * 2 - halfH);
            if (!this.snakes.some((snake) => snake.alive
                && this.dist({ x, y }, snake.points[0]) < headRadius(snake.length) + radius + 20)) return { x, y };
        }
        // 必发波不能因拥挤少于 10 个；确定性格点兜底仍保证实体半径留在边界内。
        return {
            x: quantizeSnake(-halfW + ((salt * 977) % Math.max(1, Math.floor(halfW * 2)))),
            y: quantizeSnake(-halfH + ((salt * 1597) % Math.max(1, Math.floor(halfH * 2)))),
        };
    }

    private dist(left: { x: number; y: number }, right: { x: number; y: number }): number {
        return Math.hypot(left.x - right.x, left.y - right.y);
    }

    private stepFakeRanks(): void {
        for (const entry of this.fakeRanks) {
            if (this.rngFakeRank.nextInt(0, 1000) < this.ruleset.fakeSnakeResetRatePermille) {
                entry.score = this.ruleset.fakeSnakeResetScore;
            } else {
                entry.score += this.rngFakeRank.nextInt(
                    this.ruleset.fakeSnakeIncrementMin,
                    this.ruleset.fakeSnakeIncrementMaxExclusive,
                );
            }
        }
    }

    displayRanking(selfId?: string): ISnakeWorldSnapshot["displayRank"] {
        const active = this.snakes.map((snake) => ({
            id: snake.id,
            name: snake.name,
            score: snake.score,
            length: snake.length,
            ai: snake.isAi,
        }));
        const activeMax = active.reduce((max, entry) => Math.max(max, entry.length), 0);
        const fake = this.fakeRanks.filter((entry) => entry.score < activeMax).map((entry) => ({
            ...entry,
            length: entry.score,
            ai: false,
        }));
        const ranked = [...active, ...fake]
            .sort((left, right) => right.score - left.score || right.length - left.length
                || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
        const shown = ranked.slice(0, 10).map((entry, index) => ({
            ...entry,
            rank: index + 1,
            self: entry.id === selfId,
        }));
        if (selfId && !shown.some((entry) => entry.self)) {
            const index = ranked.findIndex((entry) => entry.id === selfId);
            if (index >= 0) shown.push({ ...ranked[index], rank: index + 1, self: true });
        }
        return shown;
    }

    ranking(): readonly SnakeRankEntry[] {
        return this.snakes.map((snake) => ({
            id: snake.id,
            score: snake.score,
            length: snake.length,
            deathCount: snake.deathCount,
            scoreTick: snake.lastScoreTick,
        })).sort(compareSnakeRank);
    }

    buildSnapshot(roomEpochId: string, seq: number, runs: readonly ISnakeRunDelta[] = []): ISnakeWorldSnapshot {
        const wirePoint = (point: SnakePoint) => ({ x: quantizeSnake(point.x), y: quantizeSnake(point.y) });
        return {
            roomEpochId,
            matchId: roomEpochId,
            tick: this.tick,
            envelopeTick: this.tick,
            seq,
            snakes: this.snakes.map((snake) => ({
                id: snake.id,
                name: snake.name,
                skinId: snake.skinId,
                ai: snake.isAi,
                aiLevel: snake.aiLevel,
                alive: snake.alive,
                score: snake.score,
                length: snake.length,
                boost: snake.boostActive,
                bodyScale: snakeBodyScale(snake.length),
                magnetUntilTick: snake.alive && this.tick < snake.magnetUntilTick ? snake.magnetUntilTick : null,
                protectUntilTick: snake.alive && this.tick < snake.protectUntilTick ? snake.protectUntilTick : null,
                points: snake.alive ? snake.points.map(wirePoint) : [],
            })),
            foods: this.foodList().map((food) => ({
                id: food.id,
                kind: food.kind,
                variant: food.variant,
                x: food.x,
                y: food.y,
            })),
            wrecks: this.wreckList().map((wreck) => ({
                id: wreck.id,
                value: wreck.value,
                kind: wreck.kind,
                variant: wreck.variant,
                ...(wreck.sourceSkinId === undefined ? {} : { sourceSkinId: wreck.sourceSkinId }),
                x: wreck.x,
                y: wreck.y,
            })),
            tools: this.toolList().map((tool) => ({
                id: tool.id,
                toolId: tool.toolId,
                x: tool.x,
                y: tool.y,
                expireTick: tool.expireTick,
            })),
            runs,
            displayRank: this.displayRanking(),
        };
    }

    /** 测试/诊断观察面：不暴露 RNG 对象，只返回可重放状态。 */
    motionProbe(kind: "star" | "magnet", id: number): Readonly<{
        xMicro: number;
        yMicro: number;
        directionMilliX: number;
        directionMilliY: number;
        remainingDirectionTicks: number;
        distanceMilliRemainder: number;
    }> | null {
        const motion = kind === "star" ? this.foods.get(id)?.motion : this.tools.get(id)?.motion;
        if (!motion) return null;
        return {
            xMicro: motion.xMicro,
            yMicro: motion.yMicro,
            directionMilliX: motion.directionMilliX,
            directionMilliY: motion.directionMilliY,
            remainingDirectionTicks: motion.remainingDirectionTicks,
            distanceMilliRemainder: motion.distanceMilliRemainder,
        };
    }
}
