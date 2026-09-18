import type { HostRecord } from '../runtime/host-plan.js';
import type { LayoutRect } from '../layout/flex-types.js';
export interface InspectedNode {
    readonly id: number;
    readonly parent: number | null;
    readonly planId: number;
    readonly kind: string;
    readonly name: string;
    readonly value: string;
    readonly visible: boolean;
    readonly rect: LayoutRect;
    readonly interaction?: 'press' | 'range';
    readonly range?: {
        readonly min: number;
        readonly max: number;
        readonly step: number;
    };
    readonly interactable?: boolean;
    readonly resourceId?: string;
    readonly scrollOffset?: number;
    readonly direction?: 'vertical' | 'horizontal';
    readonly virtualKey?: string | number;
    readonly sticky?: boolean;
    readonly scrollEvidence?: {
        readonly position: number;
        readonly offset: number;
        readonly displacement: number;
        readonly maximum: number;
        readonly scrolling: boolean;
    };
}
export declare function inspectRecord<Handle>(r: HostRecord<Handle>, rect: LayoutRect, visible: boolean, scrollOffset?: number): InspectedNode;
