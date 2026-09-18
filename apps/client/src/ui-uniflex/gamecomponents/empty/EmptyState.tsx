import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export interface EmptyStateProps {
    readonly icon: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly label: string;
    readonly labelLeft: number;
    readonly labelTop: number;
    readonly labelWidth: number;
    readonly labelHeight?: number;
    readonly visible?: boolean;
}

const ICON_WIDTH = 108;
const ICON_HEIGHT = 116;
const COLOR = '#837A91';

/** Empty icon + caption. Callers inject the skin and assembled boxes. */
export const EmptyState = defineComponent<EmptyStateProps>((p) => {
    const icon = p.icon;
    const left = p.left;
    const top = p.top;
    const label = p.label;
    const labelLeft = p.labelLeft;
    const labelTop = p.labelTop;
    const labelWidth = p.labelWidth;
    const labelHeight = p.labelHeight ?? 40;
    const visible = p.visible !== false;
    const iconWidth = ICON_WIDTH;
    const iconHeight = ICON_HEIGHT;
    const font = fontRef('fonts/regular', 700);
    return (
        <view name="EmptyState" visible={visible}
            style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
            <image source={icon}
                style={{ position: 'absolute', left: left, top: top, width: iconWidth, height: iconHeight }} />
            <text value={label}
                style={{ position: 'absolute', left: labelLeft, top: labelTop, width: labelWidth, height: labelHeight,
                    font: font, fontSize: 40, color: COLOR, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
