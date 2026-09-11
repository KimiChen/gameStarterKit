import type { FontResource } from '../provider/resource-provider.js';
export interface TextLayout {
    readonly lines: readonly string[];
    readonly width: number;
    readonly height: number;
    readonly lineHeight: number;
    readonly fontSize: number;
}
/** Font-file advances, no host measurements or locale-dependent line breaking. */
export declare function layoutText(text: string, font: FontResource, fontSize?: number, lineHeight?: number, width?: number, wrap?: boolean): TextLayout;
