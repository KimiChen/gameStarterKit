import type { FlexStyle } from './layout/flex-types.js';
import type { FontRef } from './provider/resource-provider.js';
import type { BaseViewProps, ImageProps, InputProps, PlainViewProps, PressViewProps, RangeViewProps, ScrollViewProps, TextProps, VirtualListProps } from './runtime/host-plan.js';
export type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown ? Value : Value extends object ? {
    readonly [Key in keyof Value]: DeepReadonly<Value[Key]>;
} : Value;
export type StyleProp<Style> = Style | false | null | undefined | readonly StyleProp<Style>[];
/** Layout-only style accepted by reusable component roots. */
export type LayoutStyle = FlexStyle;
export interface ViewStyle extends FlexStyle {
    backgroundColor?: string;
    opacity?: number;
    scale?: number;
    translateX?: number;
    translateY?: number;
    transformDurationMs?: number;
}
export interface TextStyle extends ViewStyle {
    fontSize?: number;
    lineHeight?: number;
    color?: string;
    bold?: boolean;
    font?: FontRef;
    outlineColor?: string;
    outlineWidth?: number;
    horizontalAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'center' | 'bottom';
    wrap?: boolean;
    overflow?: 'none' | 'resizeHeight' | 'clamp' | 'shrink';
    cacheMode?: 'none' | 'bitmap' | 'char';
}
export interface ImageStyle extends ViewStyle {
    tint?: string;
    sizeMode?: 'simple' | 'sliced' | 'filled';
    intrinsic?: 'original' | 'trimmed';
}
export interface InputStyle extends ViewStyle {
    fontSize?: number;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
}
export type ScrollViewStyle = ViewStyle;
export type ElementStyle = ViewStyle | TextStyle | ImageStyle | InputStyle;
export type NamedStyles = Readonly<Record<string, StyleProp<ElementStyle>>>;
/**
 * Declares the one static project theme. The AOT compiler follows the returned symbol and embeds
 * values used by a HostPlan; the freeze is retained for ordinary TypeScript consumers.
 */
export declare function defineTheme<const Definition>(definition: Definition): DeepReadonly<Definition>;
/** Declares a module-level static style sheet consumed and erased by AOT. */
export declare function defineStyles<const Styles extends NamedStyles>(styles: Styles): DeepReadonly<Styles>;
type MovedViewKeys = 'style' | 'backgroundColor' | 'opacity' | 'scale' | 'translateX' | 'translateY' | 'transformDurationMs';
type MovedTextKeys = MovedViewKeys | 'fontSize' | 'lineHeight' | 'color' | 'bold' | 'font' | 'outlineColor' | 'outlineWidth' | 'horizontalAlign' | 'verticalAlign' | 'wrap' | 'overflow' | 'cacheMode';
type MovedImageKeys = MovedViewKeys | 'tint' | 'sizeMode' | 'intrinsic';
type MovedInputKeys = MovedViewKeys | 'fontSize' | 'color' | 'textAlign';
type AuthoringViewVariant<Props> = Omit<Props, MovedViewKeys> & {
    style?: StyleProp<ViewStyle>;
};
export type AuthoringViewProps = AuthoringViewVariant<PlainViewProps> | AuthoringViewVariant<PressViewProps> | AuthoringViewVariant<RangeViewProps>;
export type AuthoringTextProps = Omit<TextProps, MovedTextKeys> & {
    style?: StyleProp<TextStyle>;
};
export type AuthoringImageProps = Omit<ImageProps, MovedImageKeys> & {
    style?: StyleProp<ImageStyle>;
};
export type AuthoringInputProps = Omit<InputProps, MovedInputKeys> & {
    style?: StyleProp<InputStyle>;
};
export type AuthoringScrollViewProps = Omit<ScrollViewProps, MovedViewKeys> & {
    style?: StyleProp<ScrollViewStyle>;
};
export type AuthoringVirtualListProps<Value> = Omit<VirtualListProps<Value>, MovedViewKeys> & {
    style?: StyleProp<ViewStyle>;
};
export type AuthoringFloatingProps = Omit<import('./runtime/host-plan.js').FloatingProps, MovedViewKeys> & {
    style?: StyleProp<ViewStyle>;
};
export type AuthoringComponentOutletProps = Omit<BaseViewProps, MovedViewKeys | 'children'> & {
    registry: import('./runtime/host-plan.js').ComponentRegistry;
    selection: import('./runtime/host-plan.js').ComponentSelection<object> | null | undefined;
    style?: StyleProp<ViewStyle>;
};
export interface AuthoringJSXIntrinsicElements {
    view: AuthoringViewProps;
    text: AuthoringTextProps;
    input: AuthoringInputProps;
    image: AuthoringImageProps;
    'scroll-view': AuthoringScrollViewProps;
    'virtual-list': AuthoringVirtualListProps<unknown>;
}
export {};
