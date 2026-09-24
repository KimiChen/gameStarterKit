import { imageRef } from '../../../kits/uniflex/api/core/index';
import type { ProgressBarSkin } from './ProgressBarSkin';

export const heroProgress: ProgressBarSkin = {
    track: imageRef('ui/hero/progress-track'),
    fill: imageRef('ui/hero/progress-fill'),
};

export const starUpgradeProgress: ProgressBarSkin = {
    track: imageRef('ui/star-upgrade/progress-track'),
    fill: imageRef('ui/star-upgrade/progress-fill'),
    labelColor: '#65EE62',
    labelSize: 32,
};

export const allianceMarchProgress: ProgressBarSkin = {
    track: imageRef('ui/alliance-march/track'),
    fill: imageRef('ui/alliance-march/fill'),
};

export const allianceFlagProgress: ProgressBarSkin = {
    track: imageRef('ui/alliance/flag-progress-bg'),
    fill: imageRef('ui/alliance/flag-progress-fill'),
};

export const battleGreenProgress: ProgressBarSkin = {
    track: imageRef('ui/victory/bar-track'),
    fill: imageRef('ui/victory/bar-fill-green'),
    labelSize: 22,
};

export const battleRedProgress: ProgressBarSkin = {
    track: imageRef('ui/victory/bar-track'),
    fill: imageRef('ui/victory/bar-fill-red'),
    labelSize: 22,
};
