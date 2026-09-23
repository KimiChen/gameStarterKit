import type { ButtonSkin } from './ButtonSkin';
import { theme } from '../../themes/active';

/** Shared nine-slice metrics. Art comes from `theme.button.skins`. */
const sliced: Pick<ButtonSkin, 'sizeMode'> = { sizeMode: 'sliced' };

export const confirmButton: ButtonSkin = { ...theme.button.skins.confirm, ...sliced };
export const cancelButton: ButtonSkin = { ...theme.button.skins.cancel, ...sliced };
export const cyanButton: ButtonSkin = { ...theme.button.skins.cyan, ...sliced };
export const redButton: ButtonSkin = { ...theme.button.skins.red, ...sliced };
export const yellowButton: ButtonSkin = { ...theme.button.skins.yellow, ...sliced };
