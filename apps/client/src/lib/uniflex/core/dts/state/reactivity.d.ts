import { computed, markRaw, pauseTracking, resetTracking } from '@vue/reactivity';
import type { DeepReadonly } from '@vue/reactivity';
export { computed, markRaw, pauseTracking, resetTracking };
export type { DeepReadonly };
/** 同步读取拥有者初始化快照，不把读取注册到外层响应式计算。 */
export declare function untracked<T>(read: () => T): T;
export declare function createState<T extends object>(value: T): T;
export declare function readonlyState<T extends object>(value: T): DeepReadonly<T>;
export declare function afterStateBatch(callback: () => void, priority?: number): void;
/** All framework effects and collection notifications observe a completed logical batch. */
export declare function batchState<T>(work: () => T): T;
export interface TrackedComputation {
    run(): void;
    stop(): void;
}
export declare function trackComputation(evaluate: () => void, invalidate: () => void, priority?: number): TrackedComputation;
export declare function observe<T>(read: () => T, onChange: (value: T) => void): () => void;
export declare function reactivityStats(): {
    liveComputations: number;
    pendingNotifications: number;
};
