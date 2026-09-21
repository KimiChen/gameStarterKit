import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export type NotificationBadgeMode = 'count' | 'dot';

export interface NotificationBadgeProps {
    readonly theme?: ComponentTheme;
    readonly mode?: NotificationBadgeMode;
    readonly count?: number;
    readonly visible?: boolean;
    readonly source?: ImageRef;
    readonly left?: number;
    readonly top?: number;
    readonly width?: number;
    readonly height?: number;
    readonly maxCount?: number;
    readonly fontSize?: number;
    readonly color?: string;
    readonly outlineColor?: string;
    readonly outlineWidth?: number;
}

/** Count badge or plain red dot. Callers inject the skin; dots never fake a count. */
export const NotificationBadge = defineComponent<NotificationBadgeProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const isDot = p.mode === 'dot';
    const count = p.count ?? 0;
    const maxCount = p.maxCount ?? p.theme?.badge.maxCount ?? activeTheme.badge.maxCount;
    const shown = isDot ? p.visible === true : count > 0 && p.visible !== false;
    const size = isDot
        ? (p.theme?.badge.dotSize ?? activeTheme.badge.dotSize)
        : (p.theme?.badge.countSize ?? activeTheme.badge.countSize);
    const width = p.width ?? size;
    const height = p.height ?? size;
    const left = p.left ?? 0;
    const top = p.top ?? 0;
    const source = p.source ?? (isDot ? theme.badge.dot : theme.badge.count);
    const label = count > maxCount ? `${maxCount}+` : String(count);
    const showCount = !isDot;
    const fontSize = p.fontSize ?? p.theme?.badge.fontSize ?? activeTheme.badge.fontSize;
    const color = p.color ?? theme.badge.color;
    const outlineColor = p.outlineColor ?? theme.badge.outline;
    const outlineWidth = p.outlineWidth ?? p.theme?.badge.outlineWidth ?? activeTheme.badge.outlineWidth;
    const countInset = p.theme?.badge.countInset ?? activeTheme.badge.countInset;
    const font = theme.badge.font;
    return (
        <view name="NotificationBadge" visible={shown}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image name="NotificationBadge/Background" source={source}
                style={{ position: 'absolute', width: '100%', height: '100%' }} />
            <text name="NotificationBadge/Count" visible={showCount} value={label}
                style={{ position: 'absolute', left: countInset, right: countInset, top: 0, bottom: 0,
                    font: font, fontSize: fontSize, color: color, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink',
                    outlineColor: outlineColor, outlineWidth: outlineWidth }} />
        </view>
    );
});
