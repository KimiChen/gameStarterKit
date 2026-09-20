import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../badge/NotificationBadge';

export interface TabSkin {
    readonly selected?: ImageRef;
    readonly unselected?: ImageRef;
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

export interface TabProps {
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

const DEFAULT_BADGE_INSET = 26;
const DEFAULT_BADGE_TOP = -14;
const DEFAULT_COLOR = '#3F3254';

/** Generic tab chip. `left`/`top`/`width` are the unselected box; inject `skin` to swap art, type, and badge. */
export const Tab = defineComponent<TabProps>((p) => {
    const skin = p.skin;
    const visible = p.visible !== false;
    const active = p.active;
    const idleLeft = p.left;
    const idleTop = p.top;
    const idleWidth = p.width;
    const activeLeft = skin?.activeLeft ?? -3;
    const activeTop = skin?.activeTop ?? -15;
    const activeWidth = skin?.activeWidth ?? 6;
    const idleHeight = skin?.height ?? 52;
    const selectedHeight = skin?.activeHeight ?? 67;
    const idleFont = skin?.fontSize ?? 28;
    const selectedFont = skin?.activeFontSize ?? 32;
    const idleColor = skin?.color ?? DEFAULT_COLOR;
    const selectedColor = skin?.activeColor ?? idleColor;
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
    const selected = skin?.selected ?? imageRef('ui/mail/tab-active');
    const unselected = skin?.unselected ?? imageRef('ui/mail/tab-inactive');
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
    const badgeSource = p.badgeSource ?? skin?.badgeSource ?? imageRef('ui/mail/number-badge');
    const noticeSource = p.noticeSource ?? skin?.noticeSource ?? imageRef('ui/mail/unread-dot');
    const badgeInset = skin?.badgeInset ?? DEFAULT_BADGE_INSET;
    const badgeIdleTop = p.badgeTop ?? skin?.badgeTop ?? DEFAULT_BADGE_TOP;
    const badgeLeft = idleWidth - badgeInset - shiftLeft;
    const badgeTop = badgeIdleTop - shiftTop;
    const font = fontRef('fonts/regular', 700);
    return (
    <view name="Tab" visible={visible} interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
        <image visible={showBg} source={source}
            style={{ position: 'absolute', left: bgLeft, top: bgTop, width: bgWidth, height: bgHeight,
                sizeMode: sizeMode }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: font, fontSize: fontSize, color: color, bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        <NotificationBadge mode="count" count={badge} source={badgeSource}
            left={badgeLeft} top={badgeTop} />
        <NotificationBadge mode="dot" visible={notice} source={noticeSource}
            left={badgeLeft} top={badgeTop} />
    </view>
    );
});
