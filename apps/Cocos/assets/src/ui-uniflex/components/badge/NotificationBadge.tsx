import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface NotificationBadgeProps {
    readonly count: number;
    readonly source: ImageRef;
    readonly left?: number;
    readonly top?: number;
    readonly width?: number;
    readonly height?: number;
    readonly maxCount?: number;
}

/** Reusable notification count badge; callers inject the skin and optional placement. */
export const NotificationBadge = defineComponent<NotificationBadgeProps>((p) => (
    <view name="NotificationBadge" visible={p.count > 0}
        style={{ position: 'absolute', left: p.left ?? 0, top: p.top ?? 0,
            width: p.width ?? 34, height: p.height ?? 34 }}>
        <image name="NotificationBadge/Background" source={p.source}
            style={{ position: 'absolute', width: '100%', height: '100%' }} />
        <text name="NotificationBadge/Count"
            value={p.count > (p.maxCount ?? 99) ? `${p.maxCount ?? 99}+` : String(p.count)}
            style={{ position: 'absolute', left: 2, right: 2, top: 0, bottom: 0,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: '#FFFFFF', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink',
                outlineColor: '#000000', outlineWidth: 2 }} />
    </view>
));
