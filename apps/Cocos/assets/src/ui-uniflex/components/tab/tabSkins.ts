import { imageRef } from '../../../kits/uniflex/api/core/index';
import type { TabSkin } from './Tab';

export const mailTab: TabSkin = {
    selected: imageRef('ui/mail/tab-active'),
    unselected: imageRef('ui/mail/tab-inactive'),
    sizeMode: 'sliced',
    height: 52,
    activeHeight: 67,
    activeLeft: -3,
    activeTop: -15,
    activeWidth: 6,
    fontSize: 28,
    activeFontSize: 32,
    badgeSource: imageRef('ui/mail/number-badge'),
    badgeInset: 26,
    badgeTop: -14,
};

export const allianceTab: TabSkin = {
    selected: imageRef('ui/alliance/tab-selected'),
    unselected: imageRef('ui/alliance/tab-unselected'),
    sizeMode: 'sliced',
    height: 52,
    activeHeight: 67,
    activeLeft: -3,
    activeTop: -15,
    activeWidth: 6,
    fontSize: 28,
    activeFontSize: 32,
    badgeSource: imageRef('ui/mail/number-badge'),
    badgeInset: 26,
    badgeTop: -14,
};

export const flagTab: TabSkin = {
    selected: imageRef('ui/alliance/flag-tab-selected'),
    unselected: imageRef('ui/alliance/flag-tab-unselected'),
    sizeMode: 'sliced',
    height: 52,
    activeHeight: 67,
    activeLeft: -2,
    activeTop: -14,
    activeWidth: 6,
    fontSize: 28,
    activeFontSize: 32,
    badgeSource: imageRef('ui/mail/number-badge'),
    badgeInset: 26,
    badgeTop: -14,
};

export const characterTab: TabSkin = {
    selected: imageRef('ui/character/tab-selected'),
    unselected: imageRef('ui/character/tab-unselected'),
    sizeMode: 'simple',
    height: 58,
    activeHeight: 58,
    activeLeft: 0,
    activeTop: 0,
    activeWidth: 0,
    fontSize: 28,
    activeFontSize: 28,
    badgeSource: imageRef('ui/mail/number-badge'),
    badgeInset: 26,
    badgeTop: -8,
};
