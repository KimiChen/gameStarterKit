export type Length = number | `${number}%` | 'auto';
export type FlexDirection = 'row' | 'rowReverse' | 'column' | 'columnReverse';
export type FlexWrap = 'nowrap' | 'wrap' | 'wrapReverse';
export type JustifyContent = 'flexStart' | 'flexEnd' | 'center' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
export type Align = 'auto' | 'flexStart' | 'flexEnd' | 'center' | 'stretch';
export type AlignContent = Exclude<Align, 'auto'> | 'spaceBetween' | 'spaceAround';
export type Display = 'flex' | 'none';
export type Position = 'relative' | 'absolute';
export interface EdgeValues {
    top?: Length;
    right?: Length;
    bottom?: Length;
    left?: Length;
}
export type EdgeInput = Length | EdgeValues;
export interface FlexStyle {
    display?: Display;
    position?: Position;
    flexDirection?: FlexDirection;
    flexWrap?: FlexWrap;
    justifyContent?: JustifyContent;
    alignItems?: Exclude<Align, 'auto'>;
    alignSelf?: Align;
    alignContent?: AlignContent;
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: Length;
    width?: Length;
    height?: Length;
    minWidth?: Length;
    minHeight?: Length;
    maxWidth?: Length;
    maxHeight?: Length;
    aspectRatio?: number;
    margin?: EdgeInput;
    padding?: EdgeInput;
    gap?: number;
    left?: Length;
    right?: Length;
    top?: Length;
    bottom?: Length;
}
export interface LayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface MeasureConstraint {
    width: number | undefined;
    height: number | undefined;
}
export interface MeasuredSize {
    width: number;
    height: number;
}
export type MeasureFunction = (constraint: MeasureConstraint) => MeasuredSize;
export interface FlexNode {
    readonly id: number;
    style: FlexStyle;
    readonly children: FlexNode[];
    readonly frame: LayoutRect;
    measure?: MeasureFunction;
    hidden?: boolean;
}
export interface LayoutDiagnostic {
    nodeId: number;
    property: string;
    message: string;
}
export interface LayoutStats {
    nodes: number;
    measuredLeaves: number;
    percentageFallbacks: number;
}
export interface LayoutResult {
    readonly diagnostics: readonly LayoutDiagnostic[];
    readonly stats: LayoutStats;
}
export declare function createFlexNode(style?: FlexStyle, measure?: MeasureFunction): FlexNode;
export declare function appendFlexChild(parent: FlexNode, child: FlexNode): void;
