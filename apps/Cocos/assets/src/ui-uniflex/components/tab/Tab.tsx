import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import type { TabSkin } from './TabSkin';
import { NotificationBadge } from '../badge/NotificationBadge';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export type { TabSkin } from './TabSkin';

export interface TabProps {
    readonly theme?: ComponentTheme;
    readonly label: string;
    readonly active: boolean;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly skin?: TabSkin;
    readonly badge?: number;
    readonly notice?: boolean;
    readonly badgeSource?: ImageRef;
    readonly noticeSource?: ImageRef;
    readonly badgeTop?: number;
    readonly visible?: boolean;
    readonly onClick?: () => void;
}

/** Generic tab chip. `left`/`top`/`width` are the unselected box; inject `skin` to swap art, type, and badge. */
export const Tab = defineComponent<TabProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const skin = p.skin;
    const visible = p.visible !== false;
    const active = p.active;
    const idleLeft = p.left;
    const idleTop = p.top;
    const idleWidth = p.width;
    const activeLeft = skin?.activeLeft ?? p.theme?.tab.activeLeft ?? activeTheme.tab.activeLeft;
    const activeTop = skin?.activeTop ?? p.theme?.tab.activeTop ?? activeTheme.tab.activeTop;
    const activeWidth = skin?.activeWidth ?? p.theme?.tab.activeWidth ?? activeTheme.tab.activeWidth;
    const idleHeight = skin?.height ?? p.theme?.tab.height ?? activeTheme.tab.height;
    const selectedHeight = skin?.activeHeight ?? p.theme?.tab.activeHeight ?? activeTheme.tab.activeHeight;
    const idleFont = skin?.fontSize ?? p.theme?.tab.fontSize ?? activeTheme.tab.fontSize;
    const selectedFont = skin?.activeFontSize ?? p.theme?.tab.activeFontSize ?? activeTheme.tab.activeFontSize;
    const idleColor = skin?.color ?? theme.tab.color;
    const selectedColor = skin?.activeColor ?? skin?.color ?? theme.tab.activeColor;
    const sizeMode = skin?.sizeMode === 'simple' ? 'simple' : 'sliced';
    const showSelected = skin?.showSelected !== false;
    const showUnselected = skin?.showUnselected !== false;
    const shiftLeft = active ? activeLeft : 0;
    const shiftTop = active ? activeTop : 0;
    const left = idleLeft + shiftLeft;
    const top = idleTop + shiftTop;
    const width = idleWidth + (active ? activeWidth : 0);
    const height = active ? selectedHeight : idleHeight;
    const fontSize = active ? selectedFont : idleFont;
    const color = active ? selectedColor : idleColor;
    const selected = skin?.selected ?? theme.tab.selected;
    const unselected = skin?.unselected ?? theme.tab.unselected;
    const source = active ? selected : unselected;
    const showBg = active ? showSelected : showUnselected;
    const insetLeft = active ? (skin?.selectedInsetLeft ?? 0) : 0;
    const insetTop = active ? (skin?.selectedInsetTop ?? 0) : 0;
    const insetRight = active ? (skin?.selectedInsetRight ?? 0) : 0;
    const insetBottom = active ? (skin?.selectedInsetBottom ?? 0) : 0;
    const bgLeft = insetLeft;
    const bgTop = insetTop;
    const bgWidth = width - insetLeft - insetRight;
    const bgHeight = height - insetTop - insetBottom;
    const badge = p.badge ?? 0;
    const notice = p.notice === true;
    const badgeSource = p.badgeSource ?? skin?.badgeSource ?? theme.tab.badge;
    const noticeSource = p.noticeSource ?? skin?.noticeSource ?? theme.tab.notice;
    const badgeInset = skin?.badgeInset ?? p.theme?.tab.badgeInset ?? activeTheme.tab.badgeInset;
    const badgeIdleTop = p.badgeTop ?? skin?.badgeTop ?? p.theme?.tab.badgeTop ?? activeTheme.tab.badgeTop;
    const badgeLeft = idleWidth - badgeInset - shiftLeft;
    const badgeTop = badgeIdleTop - shiftTop;
    const font = theme.tab.font;
    return (
    <view name="Tab" visible={visible} interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
        <image visible={showBg} source={source}
            style={{ position: 'absolute', left: bgLeft, top: bgTop, width: bgWidth, height: bgHeight,
                sizeMode: sizeMode }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: font, fontSize: fontSize, color: color, bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        <NotificationBadge theme={theme} mode="count" count={badge} source={badgeSource}
            left={badgeLeft} top={badgeTop} />
        <NotificationBadge theme={theme} mode="dot" visible={notice} source={noticeSource}
            left={badgeLeft} top={badgeTop} />
    </view>
    );
});
