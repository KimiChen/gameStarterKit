import type { ImageRef } from '../../../kits/uniflex/api/core/index';

export interface ButtonSkin {
    readonly source?: ImageRef;
    readonly outline?: string;
    readonly labelColor?: string;
    readonly sizeMode?: 'simple' | 'sliced';
    readonly outlineWidth?: number;
}
