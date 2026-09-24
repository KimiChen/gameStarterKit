import type { ButtonSkin } from './ButtonSkin';
import { theme } from '../../themes/active';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

/** Shared nine-slice metrics. Art comes from `theme.button.skins`. */
const sliced: Pick<ButtonSkin, 'sizeMode'> = { sizeMode: 'sliced' };

export const confirmButton: ButtonSkin = { ...theme.button.skins.confirm, ...sliced };
export const cancelButton: ButtonSkin = { ...theme.button.skins.cancel, ...sliced };
export const cyanButton: ButtonSkin = { ...theme.button.skins.cyan, ...sliced };
export const redButton: ButtonSkin = { ...theme.button.skins.red, ...sliced };
export const yellowButton: ButtonSkin = { ...theme.button.skins.yellow, ...sliced };

const simple: Pick<ButtonSkin, 'sizeMode'> = { sizeMode: 'simple' };

export const backButton: ButtonSkin = { ...theme.button.skins.back, ...simple };
export const closeButton: ButtonSkin = { ...theme.button.skins.close, ...simple };

export const iconCaptionButton: ButtonSkin = {
    layout: 'icon-caption',
    source: imageRef('ui/mail-report-detail/tab-circle'),
    sizeMode: 'simple',
    width: 120,
    height: 117,
    backgroundRect: { left: 16, top: 0, width: 86, height: 86 },
    iconRect: { left: 16, top: 0, width: 86, height: 86 },
    labelRect: { left: 0, top: 88, width: 120, height: 34 },
    font: fontRef('fonts/regular', 700),
    fontSize: 30,
    bold: true,
    labelColor: '#3F3254',
    outlineWidth: 0,
};
