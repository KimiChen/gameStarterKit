import type { FlexNode, LayoutResult, MeasuredSize } from './flex-types.js';
export declare function layoutFlexTree(root: FlexNode, width: number, height: number): LayoutResult;
/**
 * Lays out a detached content root while allowing one axis to remain intrinsic.
 * Scroll containers use this instead of forcing their content root back to the
 * viewport extent on every writeback.
 */
export declare function layoutFlexTreeIntrinsic(root: FlexNode, width: number | undefined, height: number | undefined): LayoutResult;
export interface ScrollContentLayoutResult extends LayoutResult {
    readonly mainSize: number;
}
/** Lets an auto-sized plain ScrollView participate in its parent's intrinsic pass. */
export declare function measureScrollContent(root: FlexNode, direction: 'vertical' | 'horizontal', constraint: {
    width?: number;
    height?: number;
}): MeasuredSize;
/** Shared plain ScrollView sizing for Web and Cocos. */
export declare function layoutScrollContent(root: FlexNode, direction: 'vertical' | 'horizontal', viewportMain: number, viewportCross: number): ScrollContentLayoutResult;
