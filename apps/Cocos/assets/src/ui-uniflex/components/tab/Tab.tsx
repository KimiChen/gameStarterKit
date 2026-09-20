import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../badge/NotificationBadge';

export interface TabSkin {
    readonly selected?: ImageRef;
    readonly unselected?: ImageRef;
    readonly sizeMode?: 'simple' | 'sliced';
    readonly height?: number;
    readonly activeHeight?: number;
    readonly activeLeft?: number;
    readonly activeTop?: number;
    readonly activeWidth?: number;
    readonly fontSize?: number;
    readonly activeFontSize?: number;
    readonly badgeSource?: ImageRef;
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
    readonly badgeSource?: ImageRef;
    readonly badgeTop?: number;
    readonly visible?: boolean;
    readonly onClick?: () => void;
}

const DEFAULT_BADGE_INSET = 26;
const DEFAULT_BADGE_TOP = -14;

/** Generic tab chip. `left`/`top`/`width` are the unselected box; inject `skin` to swap art and badge. */
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
    const sizeMode = skin?.sizeMode === 'simple' ? 'simple' : 'sliced';
    const shiftLeft = active ? activeLeft : 0;
    const shiftTop = active ? activeTop : 0;
    const left = idleLeft + shiftLeft;
    const top = idleTop + shiftTop;
    const width = idleWidth + (active ? activeWidth : 0);
    const height = active ? selectedHeight : idleHeight;
    const fontSize = active ? selectedFont : idleFont;
    const selected = skin?.selected ?? imageRef('ui/mail/tab-active');
    const unselected = skin?.unselected ?? imageRef('ui/mail/tab-inactive');
    const source = active ? selected : unselected;
    const badge = p.badge ?? 0;
    const badgeSource = p.badgeSource ?? skin?.badgeSource ?? imageRef('ui/mail/number-badge');
    const badgeInset = skin?.badgeInset ?? DEFAULT_BADGE_INSET;
    const badgeIdleTop = p.badgeTop ?? skin?.badgeTop ?? DEFAULT_BADGE_TOP;
    const badgeLeft = idleWidth - badgeInset - shiftLeft;
    const badgeTop = badgeIdleTop - shiftTop;
    return (
    <view name="Tab" visible={visible} interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
        <image source={source}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: sizeMode }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: fontRef('fonts/regular', 700), fontSize: fontSize, color: '#3F3254', bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        <NotificationBadge mode="count" count={badge} source={badgeSource}
            left={badgeLeft} top={badgeTop} />
    </view>
    );
});
