import type { ImageRef } from '../../../../kits/uniflex/api/core/index';

export interface MailShareDestination {
    readonly id: string;
    readonly label: string;
    readonly icon: ImageRef;
    readonly iconLeft: number;
    readonly iconTop: number;
    readonly iconWidth: number;
    readonly iconHeight: number;
}
