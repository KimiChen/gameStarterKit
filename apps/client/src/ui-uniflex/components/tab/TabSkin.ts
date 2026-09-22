import type { ImageRef } from '../../../kits/uniflex/api/core/index';

export interface TabSkin {
    readonly selected?: ImageRef;
    readonly unselected?: ImageRef;
    /** Plate drawn behind the chips, in the idle row. */
    readonly track?: ImageRef;
    readonly showSelected?: boolean;
    readonly showUnselected?: boolean;
    readonly sizeMode?: 'simple' | 'sliced';
    readonly height?: number;
    readonly activeHeight?: number;
    readonly activeLeft?: number;
    readonly activeTop?: number;
    readonly activeWidth?: number;
    readonly selectedInsetLeft?: number;
    readonly selectedInsetTop?: number;
    readonly selectedInsetRight?: number;
    readonly selectedInsetBottom?: number;
    readonly fontSize?: number;
    readonly activeFontSize?: number;
    readonly color?: string;
    readonly activeColor?: string;
    readonly badgeSource?: ImageRef;
    readonly noticeSource?: ImageRef;
    readonly badgeInset?: number;
    readonly badgeTop?: number;
}
