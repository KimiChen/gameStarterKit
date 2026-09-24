import type { FontRef, ImageRef } from '../../../kits/uniflex/api/core/index';

export interface ButtonRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export interface ButtonSkin {
    readonly source?: ImageRef;
    readonly outline?: string;
    readonly labelColor?: string;
    readonly sizeMode?: 'simple' | 'sliced';
    readonly outlineWidth?: number;
    /** Omit to retain the existing text, inline-icon and single-image layouts. */
    readonly layout?: 'icon-caption';
    readonly width?: number;
    readonly height?: number;
    readonly font?: FontRef;
    readonly fontSize?: number;
    readonly bold?: boolean;
    /** Rectangles use button-local coordinates; omitted background fills the hit area. */
    readonly backgroundRect?: ButtonRect;
    readonly iconRect?: ButtonRect;
    /** Caption box for the explicit icon-caption layout. */
    readonly labelRect?: ButtonRect;
}
