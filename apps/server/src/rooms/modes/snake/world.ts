/**
 * SnakeWorld：snake 玩法的服务端权威世界（docs/snakeoff/03 §2/§3、05）。
 *
 * 设计要点：
 *  - 纯 TypeScript、零引擎依赖：⛔ 不 import cc/Colyseus Schema——Schema 摘要投影在
 *    index.ts（mode 装配层）完成，本文件的世界状态可脱离房间独立回放/测试；
 *  - 固定 tick 更新顺序（03 §3.1 十步），相同 seed + 相同输入序列 → 相同终局
 *    （`hashWorld` 供确定性测试）；一切随机性来自构造时注入的命名子流
 *    （`SeededRandom.stream`，流名见代码注释，⛔ 不用 Math.random/Date.now()）；
 *  - 硬上限全部来自 SNAKE_RULESET：身体点/食物/残骸/蛇数，超限的补刷延后而非截断。
 */
import { SeededRandom } from "@game/shared";
import { quantizeSnake, SNAKE_RULESET } from "@game/shared/gameplays/snake/ruleset";
import {
    boostAccepted,
    boostLengthCost,
    compareSnakeRank,
    deathDropPlan,
    directionFromInput,
    directionVector,
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

// ── 实体 ─────────────────────────────────────────────────────────────────

export interface SnakePoint {
    x: number;
    y: number;
}

export interface SnakeBody {
    readonly id: string; // 真人 = sessionId；AI = "ai-N"（match 内不复用）
    readonly isAi: boolean;
    readonly name: string;
    skin: number;
    alive: boolean;
    score: number;
    killCount: number;
    deathCount: number;
    length: number; // 逻辑长度（计分/消耗）
    boostDebt: number; // 加速消耗的分数债务（小数累进）
    direction: number; // 当前方向角 [0, 360)
    targetDirection: number; // 目标方向角
    boostIntent: boolean; // 本 tick 请求的加速意图
    boostActive: boolean; // 服务端接受的加速（快照/表现用）
    aiBoostTicksLeft: number; // AI 随机加速剩余 tick
    /** 路径点列，头在 [0]；间距 pointSpacing，尾部按几何长度截断。 */
    points: SnakePoint[];
    protectUntilTick: number; // 出生/复活保护截止 tick（不接受/不造成蛇间碰撞，墙仍杀）
    respawnAtTick: number; // >0 = 等待该 tick 复活；0 = 在场/永久死亡（终局前）
    lastAcceptedSeq: number; // 真人输入序号（重连续发依据）；AI 无意义
    lastScoreTick: number; // 最后一次得分变化的 tick（排名 tie-break）
    joinedTick: number; // 入场 tick（AI 让位选最低分时的稳定次序参考）
}

export type FoodKind = 0 | 1; // 0 = Dot，1 = Star

export interface SnakeFood {
    readonly id: number;
    readonly kind: FoodKind;
    readonly x: number;
    readonly y: number;
}

export interface SnakeWreck {
    readonly id: number;
    readonly value: number; // 聚合价值（1 wreck = +value 长度 +value 分）
    readonly x: number;
    readonly y: number;
}

export interface SnakeWorldEvents {
    /** 有蛇死亡（掉落已生成）；killerId 仅蛇间碰撞时存在。 */
    onDeath?(snake: SnakeBody, killerId: string | null): void;
    /** 有蛇吃到东西（表现音效用）。 */
    onEat?(snake: SnakeBody, kind: "dot" | "star" | "wreck", value: number): void;
}

// ── 空间网格（03 §7.1：cell 邻格 broad-phase）─────────────────────────────

const GRID_CELL = 150; // unit；world 700×1500 → 5×10 格
const BODY_SAMPLE_STRIDE = 2; // 身体点按此步长抽稀入格（≈36u 间隔，碰撞半径 18u 不穿透）

class SpatialGrid {
    private readonly cells = new Map<string, number[]>(); // cellKey → snake 下标数组（脏标记重建）

    static key(x: number, y: number): string {
        return `${Math.floor(x / GRID_CELL)},${Math.floor(y / GRID_CELL)}`;
    }

    /** 每 tick 全量重建（8 蛇 × ≤512 点 × 抽稀 ≈ 2k 插入，量级安全；增量是无谓复杂度）。 */
    rebuild(snakes: readonly SnakeBody[]): void {
        this.cells.clear();
        for (let index = 0; index < snakes.length; index++) {
            const snake = snakes[index];
            if (!snake.alive) continue;
            // 头单独入格（头对头判定用）
            this.insert(snake.points[0], index);
            for (let i = BODY_SAMPLE_STRIDE; i < snake.points.length; i += BODY_SAMPLE_STRIDE) {
                this.insert(snake.points[i], index);
            }
        }
    }

    private insert(point: SnakePoint, snakeIndex: number): void {
        const key = SpatialGrid.key(point.x, point.y);
        const list = this.cells.get(key);
        if (list) list.push(snakeIndex);
        else this.cells.set(key, [snakeIndex]);
    }

    /** 查询点周围 3×3 邻格的蛇下标（去重）。 */
    queryNeighbors(x: number, y: number): number[] {
        const cx = Math.floor(x / GRID_CELL);
        const cy = Math.floor(y / GRID_CELL);
        const out = new Set<number>();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const list = this.cells.get(`${cx + dx},${cy + dy}`);
                if (list) for (const index of list) out.add(index);
            }
        }
        return [...out].sort((a, b) => a - b); // 稳定次序（⛔ 不受 Set 遍历序影响）
    }
}

// ── 世界 ─────────────────────────────────────────────────────────────────

export interface SnakeWorldOptions {
    readonly matchSeed: number;
    readonly events?: SnakeWorldEvents;
    /** 测试注入：覆盖规则表（⛔ 生产恒为 SNAKE_RULESET 缺省）。 */
    readonly ruleset?: typeof SNAKE_RULESET;
}

export class SnakeWorld {
    readonly ruleset: typeof SNAKE_RULESET;
    tick = 0;
    /** 移动解禁 tick（开局倒计时期间世界冻结、食物已铺好）。 */
    readonly movementStartTick: number;
    readonly endTick: number;
    readonly snakes: SnakeBody[] = []; // 稳定次序 = 入场序（确定性依赖，⛔ 不改排序）
    private readonly snakeById = new Map<string, SnakeBody>();
    private readonly foods = new Map<number, SnakeFood>();
    private readonly wrecks = new Map<number, SnakeWreck>();
    private nextFoodId = 1;
    private nextWreckId = 1;
    private nextAiOrdinal = 0;
    private readonly grid = new SpatialGrid();
    private readonly events: SnakeWorldEvents;
    // 命名子流（⛔ 流名是确定性契约，改字面量 = 改种子）
    private readonly rngSpawn: SeededRandom; // 出生点选择与抖动
    private readonly rngFood: SeededRandom; // 食物/残骸位置
    /** AI 游走/加速决策子流（ai.ts 用；世界容器代为持有以保持流序稳定） */
    readonly rngAi: SeededRandom;
    private readonly pendingRespawns: SnakeBody[] = []; // 等待复活的蛇（按死亡先后）

    constructor(options: SnakeWorldOptions) {
        this.ruleset = options.ruleset ?? SNAKE_RULESET;
        this.events = options.events ?? {};
        this.tick = 0;
        this.movementStartTick = this.ruleset.countdownTicks;
        this.endTick = this.ruleset.countdownTicks + this.ruleset.matchTicks;
        const seed = options.matchSeed >>> 0;
        this.rngSpawn = SeededRandom.stream(seed, "snake.spawn");
        this.rngFood = SeededRandom.stream(seed, "snake.food");
        this.rngAi = SeededRandom.stream(seed, "snake.ai");
        for (let i = 0; i < this.ruleset.dotTarget; i++) this.spawnFood(0);
        for (let i = 0; i < this.ruleset.starTarget; i++) this.spawnFood(1);
    }

    // ── 蛇的生命周期 ──────────────────────────────────────────────────────

    /** 真人入座：在安全点出生一条玩家蛇（spawnLength 起步，带出生保护）。 */
    addPlayerSnake(sessionId: string, name: string, joinOrdinal: number): SnakeBody {
        return this.createSnake(sessionId, false, name, joinOrdinal % 8);
    }

    /** AI 填充：id 为 `ai-N`（match 内单调不复用，快照 id 唯一性契约）。 */
    addAiSnake(): SnakeBody {
        this.nextAiOrdinal += 1;
        return this.createSnake(`ai-${this.nextAiOrdinal}`, true, `AI-${this.nextAiOrdinal}`, 15);
    }

    private createSnake(id: string, isAi: boolean, name: string, skin: number): SnakeBody {
        const spawn = this.pickSpawnPoint();
        const snake: SnakeBody = {
            id,
            isAi,
            name,
            skin,
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
            points: this.buildInitialBody(spawn),
            protectUntilTick: this.tick + this.ruleset.spawnProtectionTicks,
            respawnAtTick: 0,
            lastAcceptedSeq: 0,
            lastScoreTick: this.tick,
            joinedTick: this.tick,
        };
        this.snakes.push(snake);
        this.snakeById.set(id, snake);
        return snake;
    }

    /** 初始身体：沿出生方向反向往后排（尾部朝场地内侧延伸的反方向）。 */
    private buildInitialBody(spawn: { x: number; y: number; direction: number }): SnakePoint[] {
        const points: SnakePoint[] = [{ x: spawn.x, y: spawn.y }];
        const back = directionVector(normalizeDegrees(spawn.direction + 180));
        const count = visiblePointCount(this.ruleset.spawnLength);
        for (let i = 1; i < count; i++) {
            points.push({
                x: quantizeSnake(spawn.x + back.x * this.ruleset.pointSpacing * i),
                y: quantizeSnake(spawn.y + back.y * this.ruleset.pointSpacing * i),
            });
        }
        return points;
    }

    get(id: string): SnakeBody | undefined {
        return this.snakeById.get(id);
    }

    foodList(): readonly SnakeFood[] {
        return [...this.foods.values()];
    }

    wreckList(): readonly SnakeWreck[] {
        return [...this.wrecks.values()];
    }

    /** 真人在席数（宽限断线仍占席——调用方按 connected 语义传）。 */
    aiTargetCount(humanSeatCount: number): number {
        return Math.max(0, this.ruleset.aiFillTarget - humanSeatCount);
    }

    countAi(): number {
        let count = 0;
        for (const snake of this.snakes) if (snake.isAi) count++;
        return count;
    }

    countHumans(): number {
        let count = 0;
        for (const snake of this.snakes) if (!snake.isAi) count++;
        return count;
    }

    /**
     * AI 让位（真人加入导致超编）：选分数最低、最早入场的在场 AI 死亡掉落——
     * ⛔ 不凭空消失（给新加入者留食物，也让「目标消失」有可视解释）。
     */
    cullAiForJoin(): SnakeBody | null {
        const candidates = this.snakes.filter((snake) => snake.isAi && snake.alive);
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.score - b.score || a.joinedTick - b.joinedTick || (a.id < b.id ? -1 : 1));
        const victim = candidates[0];
        this.killSnake(victim, null);
        return victim;
    }

    /** 真人最终离开：其蛇死亡掉落并移出世界（⛔ 不再复活）。 */
    removePlayerSnake(sessionId: string): void {
        const snake = this.snakeById.get(sessionId);
        if (!snake) return;
        if (snake.alive) this.killSnake(snake, null);
        snake.respawnAtTick = -1; // 标记永不复活
        this.snakeById.delete(sessionId);
        const index = this.snakes.indexOf(snake);
        if (index >= 0) this.snakes.splice(index, 1);
    }

    // ── 输入（真人与 AI 共用同一意图通道，03 §4.1）───────────────────────

    applyInput(id: string, dirX: number, dirY: number, boost: boolean, seq: number): boolean {
        const snake = this.snakeById.get(id);
        if (!snake || !snake.alive || snake.isAi) return false;
        if (seq <= snake.lastAcceptedSeq) return false; // 重复/倒退输入不改变状态
        snake.lastAcceptedSeq = seq;
        this.applyIntent(snake, dirX, dirY, boost);
        return true;
    }

    /** AI 意图入口（无 seq 约束）。 */
    applyAiIntent(id: string, dirX: number, dirY: number, boost: boolean): void {
        const snake = this.snakeById.get(id);
        if (!snake || !snake.alive) return;
        this.applyIntent(snake, dirX, dirY, boost);
    }

    private applyIntent(snake: SnakeBody, dirX: number, dirY: number, boost: boolean): void {
        const direction = directionFromInput(dirX, dirY);
        if (direction !== null) snake.targetDirection = direction; // 近零向量保持上一方向
        snake.boostIntent = boost;
    }

    // ── 主时钟（03 §3.1 固定十步序）──────────────────────────────────────

    /** 推进一个 fixed-step。返回 true 表示到达 endTick（mode 层据此冻结结算）。 */
    step(): boolean {
        this.tick += 1;
        if (this.tick > this.movementStartTick) {
            // 1. 输入已在 step 前由各通道写入 intent；AI 意图由 mode 层在 step 前计算。
            // 2. 转向与 boost 状态
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                snake.direction = turnTowards(snake.direction, snake.targetDirection, this.ruleset.maxTurnDegPerTick);
                snake.boostActive = boostAccepted(snake.boostIntent, snake.alive, snake.length);
            }
            // 2.5 头对头预检：两条对头接近的蛇在离散位移下会互穿（各自落在对方上一 tick
            // 的头部位置），事后按新位置检测必漏——必须在位移前按「接近且相向」收集候选。
            const headOnPairs = this.collectHeadOnPairs();
            // 3. 积分蛇头候选位置
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                this.moveSnake(snake);
            }
            // 4. 身体队列更新已随 moveSnake 完成；加速消耗与掉落：
            for (const snake of this.snakes) {
                if (!snake.alive || !snake.boostActive) continue;
                this.applyBoostCost(snake);
            }
            // 5. 重建空间网格
            this.grid.rebuild(this.snakes);
            // 6. 统一碰撞判定（先收集候选再结算，⛔ 不边遍历边杀）
            this.resolveCollisions(headOnPairs);
            // 7. 食物/残骸拾取（同 tick 争抢稳定决胜）
            this.resolvePickups();
            // 8. 复活结算
            this.resolveRespawns();
            // 9. 补充食物
            this.replenishFood();
        }
        // 10. 结束条件
        return this.tick >= this.endTick;
    }

    private moveSnake(snake: SnakeBody): void {
        const step = stepDistance(snake.boostActive);
        const direction = directionVector(snake.direction);
        const head = snake.points[0];
        const next = {
            x: quantizeSnake(head.x + direction.x * step),
            y: quantizeSnake(head.y + direction.y * step),
        };
        // 头进：新头点入列；尾部按几何长度截断（点距采样模型）。
        snake.points.unshift(next);
        const maxPoints = visiblePointCount(snake.length);
        while (snake.points.length > maxPoints) snake.points.pop();
    }

    private applyBoostCost(snake: SnakeBody): void {
        const { cost, debt } = boostLengthCost(snake.boostDebt);
        snake.boostDebt = debt;
        if (cost <= 0) return;
        snake.length = Math.max(0, snake.length - cost);
        // 长度耗尽立即失去加速资格（下一 tick 生效）；残骸掉在尾部（受全房上限约束）。
        for (let i = 0; i < cost; i++) {
            const tail = snake.points[snake.points.length - 1];
            this.spawnWreck(tail.x, tail.y, this.ruleset.boostWreckValue);
        }
    }

    /**
     * 头对头预检（位移前）：两蛇头部距离 ≤ 双方单步之和 + 碰撞距离，且相向而行
     * （方向向量夹角 > 120° 且各自朝对方去）。03 §7.4：较短者死，等长双死。
     */
    private collectHeadOnPairs(): Array<[SnakeBody, SnakeBody]> {
        const pairs: Array<[SnakeBody, SnakeBody]> = [];
        const maxStep = stepDistance(true);
        const threshold = maxStep * 2 + snakeCollisionDistance();
        for (let i = 0; i < this.snakes.length; i++) {
            const a = this.snakes[i];
            if (!a.alive || this.tick < a.protectUntilTick) continue;
            for (let j = i + 1; j < this.snakes.length; j++) {
                const b = this.snakes[j];
                if (!b.alive || this.tick < b.protectUntilTick) continue;
                const dx = b.points[0].x - a.points[0].x;
                const dy = b.points[0].y - a.points[0].y;
                const distance = Math.hypot(dx, dy);
                if (distance > threshold || distance < 1e-9) continue;
                const dirA = directionVector(a.direction);
                const dirB = directionVector(b.direction);
                // 相向：a 朝 b、b 朝 a（各自方向与连线的点积 > 0），且方向大体相反
                const toward = (dirA.x * dx + dirA.y * dy) > 0 && (dirB.x * -dx + dirB.y * -dy) > 0;
                const opposed = (dirA.x * dirB.x + dirA.y * dirB.y) < -0.5;
                if (toward && opposed) pairs.push([a, b]);
            }
        }
        return pairs;
    }

    private resolveCollisions(preMoveHeadPairs: Array<[SnakeBody, SnakeBody]>): void {
        const bounds = wallBounds();
        const collisionDistance = snakeCollisionDistance();
        const deaths: Array<{ snake: SnakeBody; killer: SnakeBody | null }> = [];
        const headPairs: Array<[SnakeBody, SnakeBody]> = [...preMoveHeadPairs];
        // 头对头候选对之间本 tick 豁免身体判定：对头互冲在离散位移下双方头部会互换位置，
        // 各自落在对方上一 tick 的头部（此刻已成颈部路径点）——那正是头对头接触本身，
        // ⛔ 不能再按「撞身体」重复结算（否则较短者/等长双死的规则被身体判定抢先）。
        const headOnPairKeys = new Set<string>();
        for (const [a, b] of headPairs) {
            headOnPairKeys.add(`${a.id}|${b.id}`);
            headOnPairKeys.add(`${b.id}|${a.id}`);
        }

        for (const snake of this.snakes) {
            if (!snake.alive) continue;
            const head = snake.points[0];
            // 墙（保护期也生效）
            if (Math.abs(head.x) > bounds.halfWidth || Math.abs(head.y) > bounds.halfHeight) {
                deaths.push({ snake, killer: null });
                continue;
            }
            if (this.tick < snake.protectUntilTick) continue; // 出生保护：不参与蛇间碰撞（双向）
            // 自身（跳过头部紧邻的一段——连续路径天然重叠；03 §7.3）
            const selfSkip = Math.max(4, Math.ceil((2 * this.ruleset.bodyWidth) / this.ruleset.pointSpacing));
            let selfHit = false;
            for (let i = selfSkip; i < snake.points.length; i++) {
                if (this.dist(head, snake.points[i]) < collisionDistance) { selfHit = true; break; }
            }
            if (selfHit) {
                deaths.push({ snake, killer: null });
                continue;
            }
            // 他蛇身体（保护期蛇的身体也不造成碰撞——上面的 continue 保证它们不在候选里）
            let bodyKiller: SnakeBody | null = null;
            let bodyKillerDistance = Infinity;
            for (const otherIndex of this.grid.queryNeighbors(head.x, head.y)) {
                const other = this.snakes[otherIndex];
                if (!other || other.id === snake.id || !other.alive) continue;
                if (this.tick < other.protectUntilTick) continue;
                if (headOnPairKeys.has(`${snake.id}|${other.id}`)) continue; // 头对头对，豁免身体判定
                for (let i = 1; i < other.points.length; i++) { // i=0 是头，头对头单独判定
                    const distance = this.dist(head, other.points[i]);
                    if (distance < collisionDistance && distance < bodyKillerDistance) {
                        bodyKiller = other;
                        bodyKillerDistance = distance;
                    }
                }
            }
            if (bodyKiller) {
                deaths.push({ snake, killer: bodyKiller });
                continue;
            }
            // 头对头候选（同 tick 统一结算：较短者死，等长双死）
            for (const otherIndex of this.grid.queryNeighbors(head.x, head.y)) {
                const other = this.snakes[otherIndex];
                if (!other || other.id === snake.id || !other.alive) continue;
                if (this.tick < other.protectUntilTick) continue;
                if (snake.id < other.id && this.dist(head, other.points[0]) < collisionDistance
                    && !headPairs.some(([a, b]) => (a === snake && b === other) || (a === other && b === snake))) {
                    headPairs.push([snake, other]); // 每对只收一次（id 序 + 预检去重）
                }
            }
        }

        for (const [a, b] of headPairs) {
            const aDoomed = deaths.some((entry) => entry.snake === a);
            const bDoomed = deaths.some((entry) => entry.snake === b);
            if (a.length < b.length) {
                if (!aDoomed) deaths.push({ snake: a, killer: b });
            } else if (b.length < a.length) {
                if (!bDoomed) deaths.push({ snake: b, killer: a });
            } else {
                if (!aDoomed) deaths.push({ snake: a, killer: b });
                if (!bDoomed) deaths.push({ snake: b, killer: a });
            }
        }

        // 统一应用死亡（稳定次序：snakes 入场序）
        for (const { snake, killer } of deaths) {
            if (!snake.alive) continue; // 同 tick 已死（头对头双死等）
            this.killSnake(snake, killer);
        }
    }

    private resolvePickups(): void {
        // 同 tick 多蛇覆盖同一食物：最小头心距离优先，其次 id 字典序（03 §5.3）。
        const claims = new Map<number, { snake: SnakeBody; kind: "food" | "wreck"; distance: number }>();
        const consider = (entityId: number, kind: "food" | "wreck", x: number, y: number, radius: number): void => {
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                const distance = this.dist(snake.points[0], { x, y });
                if (distance >= eatDistance(radius)) continue;
                const existing = claims.get(entityId);
                if (!existing || distance < existing.distance
                    || (distance === existing.distance && snake.id < existing.snake.id)) {
                    claims.set(entityId, { snake, kind, distance });
                }
            }
        };
        for (const food of this.foods.values()) {
            consider(food.id, "food", food.x, food.y,
                food.kind === 0 ? this.ruleset.dotRadius : this.ruleset.starRadius);
        }
        for (const wreck of this.wrecks.values()) {
            consider(-wreck.id, "wreck", wreck.x, wreck.y, this.ruleset.wreckRadius); // 负 id 防与 food 撞键
        }
        // 稳定应用顺序：实体 id 升序
        const ordered = [...claims.entries()].sort((a, b) => a[0] - b[0]);
        for (const [entityId, claim] of ordered) {
            const snake = claim.snake;
            if (!snake.alive) continue;
            if (claim.kind === "food") {
                const food = this.foods.get(entityId);
                if (!food) continue;
                const growth = food.kind === 0 ? this.ruleset.dotGrowth : this.ruleset.starGrowth;
                const score = food.kind === 0 ? this.ruleset.dotScore : this.ruleset.starScore;
                snake.length += growth;
                this.addScore(snake, score);
                this.foods.delete(entityId);
                this.events.onEat?.(snake, food.kind === 0 ? "dot" : "star", score);
            } else {
                const wreck = this.wrecks.get(-entityId);
                if (!wreck) continue;
                snake.length += wreck.value;
                this.addScore(snake, wreck.value);
                this.wrecks.delete(-entityId);
                this.events.onEat?.(snake, "wreck", wreck.value);
            }
        }
    }

    private resolveRespawns(): void {
        for (let i = 0; i < this.pendingRespawns.length; i++) {
            const snake = this.pendingRespawns[i];
            if (snake.respawnAtTick <= 0 || this.tick < snake.respawnAtTick) continue;
            if (this.tick + this.ruleset.respawnDelayTicks >= this.endTick) {
                // 倒计时剩余不足复活延迟：不再复活（03 §8.2），移出等待队列
                this.pendingRespawns.splice(i, 1);
                i--;
                continue;
            }
            const spawn = this.tryPickSpawnPoint();
            if (!spawn) continue; // 无安全点：下一 tick 再试（03 §6.2 延后语义）
            this.pendingRespawns.splice(i, 1);
            i--;
            snake.alive = true;
            snake.length = this.ruleset.spawnLength; // 复活回初始长度，分数保留（拍板）
            snake.boostDebt = 0;
            snake.direction = spawn.direction;
            snake.targetDirection = spawn.direction;
            snake.boostIntent = false;
            snake.boostActive = false;
            snake.points = this.buildInitialBody(spawn);
            snake.protectUntilTick = this.tick + this.ruleset.spawnProtectionTicks;
            snake.respawnAtTick = 0;
        }
    }

    private replenishFood(): void {
        let budget = this.ruleset.foodReplenishPerTick;
        while (this.foodCount(0) < this.ruleset.dotTarget && budget > 0) {
            this.spawnFood(0);
            budget--;
        }
        while (this.foodCount(1) < this.ruleset.starTarget && budget > 0) {
            this.spawnFood(1);
            budget--;
        }
    }

    // ── 内部机制 ─────────────────────────────────────────────────────────

    private killSnake(snake: SnakeBody, killer: SnakeBody | null): void {
        if (!snake.alive) return;
        snake.alive = false;
        snake.deathCount += 1;
        snake.boostActive = false;
        snake.boostIntent = false;
        if (killer && killer.id !== snake.id) killer.killCount += 1;
        // 死亡掉落：沿身体均匀采样（03 §6.4；价值聚合，不为每个身体点建对象）
        const plan = deathDropPlan(snake.length);
        if (plan.count > 0) {
            for (let i = 0; i < plan.count; i++) {
                const index = Math.min(snake.points.length - 1,
                    Math.floor((i + 0.5) * (snake.points.length / plan.count)));
                const point = snake.points[Math.max(0, index)];
                this.spawnWreck(point.x, point.y, plan.valuePerWreck);
            }
        }
        // 复活资格：终局前不足复活延迟则不再复活
        if (snake.respawnAtTick >= 0 && this.tick + this.ruleset.respawnDelayTicks < this.endTick) {
            snake.respawnAtTick = this.tick + this.ruleset.respawnDelayTicks;
            this.pendingRespawns.push(snake);
        }
        this.events.onDeath?.(snake, killer?.id ?? null); // 让位/离场同样公告（客户端表现一致）
    }

    private addScore(snake: SnakeBody, delta: number): void {
        if (delta <= 0) return;
        snake.score += delta;
        snake.lastScoreTick = this.tick;
    }

    private spawnFood(kind: FoodKind): void {
        const radius = kind === 0 ? this.ruleset.dotRadius : this.ruleset.starRadius;
        const point = this.tryPlaceEntity(radius, this.rngFood);
        if (!point) return; // 尝试上限：延后补充（03 §6.2）
        const id = this.nextFoodId++;
        this.foods.set(id, { id, kind, x: point.x, y: point.y });
    }

    private spawnWreck(x: number, y: number, value: number): void {
        if (this.wrecks.size >= this.ruleset.wreckRoomCap) return; // 全房上限：丢弃（03 §2.3 硬上限）
        const id = this.nextWreckId++;
        this.wrecks.set(id, { id, value, x: quantizeSnake(x), y: quantizeSnake(y) });
    }

    private foodCount(kind: FoodKind): number {
        let count = 0;
        for (const food of this.foods.values()) if (food.kind === kind) count++;
        return count;
    }

    /** 出生点：竖向分散的候选区 + 安全距离过滤 + 子流抖动。 */
    private pickSpawnPoint(): { x: number; y: number; direction: number } {
        return this.tryPickSpawnPoint() ?? { x: 0, y: 0, direction: 90 }; // 中心兜底（世界初创必安全）
    }

    private tryPickSpawnPoint(): { x: number; y: number; direction: number } | null {
        const bounds = wallBounds();
        const safe = this.ruleset.spawnSafeDistance;
        for (let attempt = 0; attempt < this.ruleset.foodSpawnMaxAttempts; attempt++) {
            const x = quantizeSnake(this.rngSpawn.next() * (bounds.halfWidth - safe) * 2
                - (bounds.halfWidth - safe));
            const y = quantizeSnake(this.rngSpawn.next() * (bounds.halfHeight - safe) * 2
                - (bounds.halfHeight - safe));
            let clear = true;
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                if (this.dist({ x, y }, snake.points[0]) < safe) { clear = false; break; }
            }
            if (!clear) continue;
            // 出生方向指向场地中心（03 §8.1）
            return { x, y, direction: normalizeDegrees((Math.atan2(-y, -x) * 180) / Math.PI) };
        }
        return null;
    }

    /** 实体摆放：不与墙安全边距/蛇头/现有实体严重重叠，尝试上限后放弃（本 tick）。 */
    private tryPlaceEntity(radius: number, rng: SeededRandom): { x: number; y: number } | null {
        const bounds = wallBounds();
        for (let attempt = 0; attempt < this.ruleset.foodSpawnMaxAttempts; attempt++) {
            const x = quantizeSnake(rng.next() * (bounds.halfWidth - radius) * 2 - (bounds.halfWidth - radius));
            const y = quantizeSnake(rng.next() * (bounds.halfHeight - radius) * 2 - (bounds.halfHeight - radius));
            let clear = true;
            for (const snake of this.snakes) {
                if (!snake.alive) continue;
                if (this.dist({ x, y }, snake.points[0]) < headRadius() + radius + 20) { clear = false; break; }
            }
            if (clear) return { x, y };
        }
        return null;
    }

    private dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    // ── 排名与快照 ───────────────────────────────────────────────────────

    /** 稳定排名（含死亡/等待复活的蛇——它们仍有分数；AI 上榜）。 */
    ranking(): readonly SnakeRankEntry[] {
        const entries: SnakeRankEntry[] = this.snakes.map((snake) => ({
            id: snake.id,
            score: snake.score,
            length: snake.length,
            deathCount: snake.deathCount,
            scoreTick: snake.lastScoreTick,
        }));
        return entries.sort(compareSnakeRank);
    }

    /** 世界快照（S2C；坐标量化整数）。超 64KiB 预算时按 stride 降采样非头点（03 §2.3）。 */
    buildSnapshot(matchId: string, seq: number): {
        matchId: string;
        tick: number;
        seq: number;
        snakes: Array<{
            id: string; name: string; skin: number; ai: boolean; alive: boolean;
            score: number; length: number; boost: boolean;
            points: Array<{ x: number; y: number }>;
        }>;
        foods: Array<{ id: number; kind: number; x: number; y: number }>;
        wrecks: Array<{ id: number; value: number; x: number; y: number }>;
    } {
        const roundPoint = (point: SnakePoint) => ({ x: Math.round(point.x), y: Math.round(point.y) });
        const build = (stride: number) => this.snakes.map((snake) => ({
            id: snake.id,
            name: snake.name,
            skin: snake.skin,
            ai: snake.isAi,
            alive: snake.alive,
            score: snake.score,
            length: Math.round(snake.length),
            boost: snake.boostActive,
            points: snake.alive
                ? snake.points.filter((_, index) => index % stride === 0
                    || index === snake.points.length - 1).map(roundPoint)
                : [roundPoint(snake.points[0])], // 死亡蛇只留头部位置（死亡表现锚点）
        }));
        let stride = 1;
        let snakes = build(stride);
        // 粗估字节（msgpack 数量级）：点 ~10B、食物/残骸 ~12B；超预算则升 stride 降采样
        const estimate = () => snakes.reduce((sum, snake) => sum + snake.points.length * 10 + 60, 0)
            + (this.foods.size + this.wrecks.size) * 12;
        while (estimate() > this.ruleset.snapshotMaxBytes && stride < 8) {
            stride *= 2;
            snakes = build(stride);
        }
        return {
            matchId,
            tick: this.tick,
            seq,
            snakes,
            foods: this.foodList().map((food) => ({ ...food })),
            wrecks: this.wreckList().map((wreck) => ({ ...wreck })),
        };
    }
}
