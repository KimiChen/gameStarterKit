import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export type NotificationBadgeMode = 'count' | 'dot';

export interface NotificationBadgeProps {
    readonly mode?: NotificationBadgeMode;
    readonly count?: number;
    readonly visible?: boolean;
    readonly source: ImageRef;
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

const COUNT_SIZE = 34;
const DOT_SIZE = 24;
const DEFAULT_MAX_COUNT = 99;

/** Count badge or plain red dot. Callers inject the skin; dots never fake a count. */
export const NotificationBadge = defineComponent<NotificationBadgeProps>((p) => {
    const isDot = p.mode === 'dot';
    const count = p.count ?? 0;
    const maxCount = p.maxCount ?? DEFAULT_MAX_COUNT;
    const shown = isDot ? p.visible === true : count > 0 && p.visible !== false;
    const size = isDot ? DOT_SIZE : COUNT_SIZE;
    const width = p.width ?? size;
    const height = p.height ?? size;
    const left = p.left ?? 0;
    const top = p.top ?? 0;
    const source = p.source;
    const label = count > maxCount ? `${maxCount}+` : String(count);
    const showCount = !isDot;
    const fontSize = p.fontSize ?? 24;
    const color = p.color ?? '#FFFFFF';
    const outlineColor = p.outlineColor ?? '#000000';
    const outlineWidth = p.outlineWidth ?? 2;
    const font = fontRef('fonts/regular', 700);
    return (
        <view name="NotificationBadge" visible={shown}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image name="NotificationBadge/Background" source={source}
                style={{ position: 'absolute', width: '100%', height: '100%' }} />
            <text name="NotificationBadge/Count" visible={showCount} value={label}
                style={{ position: 'absolute', left: 2, right: 2, top: 0, bottom: 0,
                    font: font, fontSize: fontSize, color: color, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink',
                    outlineColor: outlineColor, outlineWidth: outlineWidth }} />
        </view>
    );
});
