import type { TabSkin } from './TabSkin';
import { theme } from '../../themes/active';

const RAISED_COLOR = theme.tab.color;

export const mailTab: TabSkin = {
    ...theme.tab.skins.mail,
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
    badgeSource: theme.tab.badge,
    badgeInset: 26,
    badgeTop: -14,
};

/** Alliance and flag bars use the mail nine-slice art. */
export const allianceTab: TabSkin = mailTab;
export const flagTab: TabSkin = mailTab;

export const characterTab: TabSkin = {
    ...theme.tab.skins.character,
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
    badgeSource: theme.tab.badge,
    badgeInset: 26,
    badgeTop: -8,
};

export const heroListTab: TabSkin = {
    ...theme.tab.skins.heroList,
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
    color: theme.tab.color,
    activeColor: theme.tab.activeColor,
};

export const heroDetailTab: TabSkin = {
    ...theme.tab.skins.heroDetail,
    showUnselected: false,
    sizeMode: 'sliced',
    height: 90,
    activeHeight: 90,
    activeLeft: 0,
    activeTop: 0,
    activeWidth: 0,
    fontSize: 36,
    activeFontSize: 36,
    color: theme.button.label,
    activeColor: theme.tab.color,
    badgeInset: 43,
    badgeTop: 7,
};
