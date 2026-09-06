/**
 * GameplayModule 契约（Non-intrusive §7.6/§7.7 阶段 9）。
 *
 * 一个玩法拥有的客户端模块：launch 校验、room joiner、plugin 工厂与可选 lobby
 * contribution 收敛为单个对象；generated client catalog 只注入稳定服务
 * （gameplay/services 的 GameplayServicesContext），⛔ 不再把 xxxJoiner 逐个加进
 * catalog context。
 *
 * generation 守卫（§7.7）：`GameplayInstanceHost.generation` **直接是**
 * RoomController 已有的那个计数器值（经 plugin.start 收到的 context.generation
 * 绑定，该值就是 RoomController.currentGeneration 为本局分配的值），⛔ 本模块不新增
 * 第二个玩法世代计数。守卫关系显式定义为「route signal + gameplay generation」双守卫：
 *  - route 侧：AppRuntime 的 enterBattle/launch AbortSignal（route close/replace 即
 *    abort），经 context.isActive() 参与判定，先失效；
 *  - gameplay 侧：本文件的 generation 比对（旧 View、迟到 join、迟到 RPC 或上一局的
 *    async callback 无权操作后来创建的 room），后失效。
 * `dispatchInput` / `requestExit` 两者都校验；任一失效即拒绝。
 *
 * 本模块是纯 TypeScript（logic/ 边界）：⛔ 不 import cc / fairygui-cc / net 客户端。
 */
import type { GameplayContext, GameplayPlugin, GameplayStopReason, RoomCapability } from "./GameplayPlugin";
import type { GameplayRegistry } from "./GameplayRegistry";
import type { GameplayRoomJoiner } from "./RoomController";

/** 玩法侧允许发起的退出原因（§7.7）；其余 stop kind ⛔ 只能由 host 内部产生。 */
export type GameplayExitReason = "user-exit" | "settled";

/**
 * §7.7 generation-fenced presentation host：RoomController 的面向引擎投影。
 * View/presentation 只经此面回流输入与退出请求，⛔ 不得直接触达 controller。
 */
export interface GameplayInstanceHost<TInput = unknown> {
    /** 本局 generation = RoomController.currentGeneration 为本局分配的值（plugin.start 时绑定；绑定前为 0）。 */
    readonly generation: number;
    isActive(): boolean;
    /** 转发 RoomController.input；旧 generation / 未启动 / route signal 失效一律拒绝（false）。 */
    dispatchInput(input: TInput): Promise<boolean>;
    /** 转发 RoomController.stop；退出原因映射见 gameplayExitStopReason。 */
    requestExit(reason: GameplayExitReason): Promise<void>;
}

/** module 拥有的 room joiner：签名带已校验 launch（与既有 RoomController joiner 对齐）。 */
export interface GameplayModuleRoomJoiner<TLaunch = unknown, TRoom = unknown> {
    join(launch: TLaunch, signal: AbortSignal): RoomCapability<TRoom>;
}

/**
 * 可选 lobby contribution（§7.6）：菜单入口已由 plugins 通道（generated menu
 * contribution）承载，本字段只承载 launch 参数装配（如私房 Lobby 页联动产出
 * roomId/ticket 等 launch 载荷）；无需要时省略。
 */
export interface GameplayLobbyContribution<TLaunch = unknown> {
    /** 组装一次 launch 参数（页面联动的产出经 validateLaunch 校验后交给 joiner）。 */
    prepareLaunch(input: unknown): TLaunch | Promise<TLaunch>;
}

/** §7.6 玩法客户端模块。id 必须等于 canonical gameplay mode id。 */
export interface GameplayModule<TLaunch = unknown, TInput = unknown, TRoom = unknown> {
    readonly id: string;
    validateLaunch(input: unknown): TLaunch;
    readonly joiner: GameplayModuleRoomJoiner<TLaunch, TRoom>;
    createPlugin(host: GameplayInstanceHost<TInput>): GameplayPlugin<TRoom, TInput>;
    readonly lobby?: GameplayLobbyContribution<TLaunch>;
}

/**
 * 宿主注入的 controller 桥（AppRuntime 构造，闭包引用其当前 RoomController）：
 * host 的 generation/输入/退出全部经它转发，⛔ 不携带第二份世代状态。
 * `dispatchInput` 同时是 §7.8 的宿主输入闸位（hide 期间由宿主拒绝新输入意图）。
 */
export interface GameplayControllerBridge {
    /** RoomController.currentGeneration 的现值（唯一玩法世代计数）。 */
    currentGeneration(): number;
    dispatchInput(input: unknown): Promise<boolean>;
    requestStop(reason: GameplayStopReason): Promise<void>;
}

/**
 * 玩法退出原因 → 既有 GameplayStopKind 的写死映射（§7.7 词汇表）：
 *  - `user-exit` → `manual`：既有“主动退出”。
 *  - `settled` → `manual`：现状结算退出与主动退出走完全相同的
 *    `controller.stop → 恢复已登录 Home` 通用恢复路径，无差异化回滚或上报，
 *    语义即主动退出，⛔ 不为它新增枚举值。若未来结算退出需要与主动退出区分
 *    （结算面板驻留、战绩上报差异等），在 GameplayStopKind 增设 `settled` 并在
 *    该处说明行为差异。
 * `cancelled` / `disposed` / `room-lost` / `plugin-error` ⛔ 不由玩法侧发起，
 * 只能由 host（RoomController / AppRuntime 会话接线）内部产生——本映射刻意
 * 不提供它们的入口。
 */
export function gameplayExitStopReason(reason: GameplayExitReason): GameplayStopReason {
    switch (reason) {
        case "user-exit":
            return { kind: "manual" };
        case "settled":
            return { kind: "manual" };
    }
}

/**
 * 把一个 GameplayModule 登记进既有 GameplayRegistry。
 *
 * - joiner：module joiner 适配为 registry 形状；当前 launch 通道（LaunchPort target）
 *   不携带参数载荷，登记态 join 使用 `validateLaunch({})` 的默认 launch——带参 launch
 *   （私房等）由 lobby contribution 组装后走同一 `join(launch, signal)` 接缝。
 * - factory：每次启动创建新 plugin 实例；host 在 plugin.start 收到 context 时绑定
 *   generation（该值即 RoomController 为本局分配的 currentGeneration）。
 */
export function registerGameplayModule<TLaunch, TInput, TRoom>(
    registry: GameplayRegistry<TRoom, TInput>,
    module: GameplayModule<TLaunch, TInput, TRoom>,
    bridge: GameplayControllerBridge,
    options: { readonly replace?: boolean } = {},
): () => void {
    if (!module || typeof module !== "object"
        || typeof module.validateLaunch !== "function"
        || !module.joiner || typeof module.joiner.join !== "function"
        || typeof module.createPlugin !== "function") {
        throw new TypeError("[GameplayModule] module 必须提供 validateLaunch/joiner/createPlugin");
    }
    if (!bridge || typeof bridge.currentGeneration !== "function"
        || typeof bridge.dispatchInput !== "function"
        || typeof bridge.requestStop !== "function") {
        throw new TypeError("[GameplayModule] bridge 必须提供 currentGeneration/dispatchInput/requestStop");
    }
    const joiner: GameplayRoomJoiner<TRoom> = {
        join: (signal) => module.joiner.join(module.validateLaunch({}), signal),
    };
    return registry.register(
        module.id,
        () => createModulePlugin(module, bridge),
        { joiner, ...(options.replace ? { replace: true } : {}) },
    );
}

/** 为一次启动构造 host + plugin：host 世代随 plugin.start 的 context 绑定。 */
function createModulePlugin<TLaunch, TInput, TRoom>(
    module: GameplayModule<TLaunch, TInput, TRoom>,
    bridge: GameplayControllerBridge,
): GameplayPlugin<TRoom, TInput> {
    let bound: GameplayContext<TRoom> | null = null;
    const isCurrentGeneration = (): boolean =>
        bound !== null && bridge.currentGeneration() === bound.generation;
    const host: GameplayInstanceHost<TInput> = {
        get generation(): number {
            return bound?.generation ?? 0;
        },
        isActive: () => bound !== null && bound.isActive() && isCurrentGeneration(),
        dispatchInput: (input: TInput): Promise<boolean> => {
            const context = bound;
            // 双守卫：route signal（context.isActive 含 signal.aborted）+ gameplay
            // generation。旧 generation 的迟到调用一律拒绝，不得染指新房。
            if (!context || !context.isActive() || bridge.currentGeneration() !== context.generation) {
                return Promise.resolve(false);
            }
            return bridge.dispatchInput(input);
        },
        requestExit: (reason: GameplayExitReason): Promise<void> => {
            const context = bound;
            if (!context || bridge.currentGeneration() !== context.generation) {
                // 旧 generation 的退出请求只结束自身：新一局不归它管。
                return Promise.resolve();
            }
            return bridge.requestStop(gameplayExitStopReason(reason));
        },
    };
    const plugin = module.createPlugin(host);
    if (!plugin || typeof plugin !== "object" || typeof plugin.start !== "function") {
        throw new TypeError(`[GameplayModule] ${module.id} createPlugin 未返回有效 plugin`);
    }
    // 包装 start 以绑定 generation；可选 hook 保持可选（RoomController 按存在性调度）。
    const handleInput = plugin.handleInput?.bind(plugin);
    const tick = plugin.tick?.bind(plugin);
    const stop = plugin.stop?.bind(plugin);
    const dispose = plugin.dispose?.bind(plugin);
    return {
        id: plugin.id,
        start: (context) => {
            if (bound === null) bound = context;
            return plugin.start(context);
        },
        ...(handleInput ? { handleInput } : {}),
        ...(tick ? { tick } : {}),
        ...(stop ? { stop } : {}),
        ...(dispose ? { dispose } : {}),
    };
}
