import type { ImageRef } from '../../../kits/uniflex/api/core/index';

/** Artwork and text treatment shared by progress bars across screens. */
export interface ProgressBarSkin {
    readonly track: ImageRef;
    readonly fill: ImageRef;
    readonly inset?: number;
    readonly labelColor?: string;
    readonly labelSize?: number;
    readonly labelOutline?: string;
    readonly outlineWidth?: number;
}
