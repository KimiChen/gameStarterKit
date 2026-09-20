import { imageRef } from '../../../kits/uniflex/api/core/index';
import type { TabSkin } from './Tab';

const RAISED_COLOR = '#3F3254';

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
    color: RAISED_COLOR,
    activeColor: RAISED_COLOR,
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
    color: RAISED_COLOR,
    activeColor: RAISED_COLOR,
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
    color: RAISED_COLOR,
    activeColor: RAISED_COLOR,
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
    color: RAISED_COLOR,
    activeColor: RAISED_COLOR,
    badgeSource: imageRef('ui/mail/number-badge'),
    badgeInset: 26,
    badgeTop: -8,
};

export const heroListTab: TabSkin = {
    selected: imageRef('ui/hero/tabs-selected'),
    showUnselected: false,
    sizeMode: 'simple',
    height: 80,
    activeHeight: 80,
    activeLeft: 0,
    activeTop: 0,
    activeWidth: 0,
    selectedInsetLeft: 3,
    selectedInsetTop: 5,
    selectedInsetRight: 2,
    selectedInsetBottom: 1,
    fontSize: 32,
    activeFontSize: 32,
    color: '#584871',
    activeColor: '#584871',
};

export const heroDetailTab: TabSkin = {
    selected: imageRef('ui/hero-detail/nav-selected'),
    showUnselected: false,
    sizeMode: 'sliced',
    height: 90,
    activeHeight: 90,
    activeLeft: 0,
    activeTop: 0,
    activeWidth: 0,
    fontSize: 36,
    activeFontSize: 36,
    color: '#ffffff',
    activeColor: '#3F3254',
    badgeInset: 43,
    badgeTop: 7,
};
