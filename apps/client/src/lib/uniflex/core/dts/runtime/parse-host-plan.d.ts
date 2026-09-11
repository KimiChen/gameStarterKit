import type { HostPlan } from './host-plan.js';
export interface HostPlanContract {
    readonly name: string;
    readonly sha256: string;
    readonly slotCount: number;
    readonly repeatSlots: Readonly<Record<number, number>>;
}
/** Validate data at the loading boundary, never in the frame/layout path. */
export declare function parseHostPlan(value: unknown, contract?: HostPlanContract): HostPlan;
