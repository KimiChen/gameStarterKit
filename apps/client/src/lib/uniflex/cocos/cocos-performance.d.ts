import type { UIProvider } from '../core/index.js';
import type { Cancellation } from './cancellation.js';
export interface CocosPerformanceMetric {
    readonly name: string;
    readonly value: number;
    readonly unit: 'ms' | 'count';
    readonly budgetMax?: number;
    readonly status: 'PASS' | 'WARN' | 'INFO';
}
export interface CocosPerformanceReport {
    readonly schemaVersion: 1;
    readonly generatedAt: string;
    readonly platform: string;
    readonly nodeCount: number;
    readonly measuredTextLeaves: number;
    readonly metrics: readonly CocosPerformanceMetric[];
    readonly initialWindows: readonly InitialWindowEvidence[];
    readonly runtime: {
        readonly nodesCreated: number;
        readonly nodesDestroyed: number;
        readonly commits: number;
        readonly commands: number;
        readonly componentUpdates: number;
    };
}
/**
 * Explicit real-engine benchmark. It only runs when MainBootstrap sees ?perf=1,
 * so normal scenes pay no node or frame cost for the suite.
 */
export declare function runCocosPerformanceSuite(provider: UIProvider, signal?: Cancellation): Promise<CocosPerformanceReport>;
interface InitialWindowEvidence {
    readonly name: string;
    readonly animation: boolean;
    readonly firstItems: number;
    readonly creationTimesMs: readonly number[];
    readonly frames: readonly {
        timeMs: number;
        addedNodes: number;
        addedItems: number;
    }[];
    readonly burstViolations: number;
    readonly intervalViolations: number;
}
export {};
