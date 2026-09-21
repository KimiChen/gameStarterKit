import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface EmptyStateProps {
    readonly theme?: ComponentTheme;
    readonly icon?: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly label: string;
    readonly labelLeft: number;
    readonly labelTop: number;
    readonly labelWidth: number;
    readonly labelHeight?: number;
    readonly visible?: boolean;
    readonly color?: string;
}

/** Empty icon + caption. Callers inject the skin and assembled boxes. */
export const EmptyState = defineComponent<EmptyStateProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const icon = p.icon ?? theme.empty.icon;
    const left = p.left;
    const top = p.top;
    const label = p.label;
    const labelLeft = p.labelLeft;
    const labelTop = p.labelTop;
    const labelWidth = p.labelWidth;
    const labelHeight = p.labelHeight ?? p.theme?.empty.labelHeight ?? activeTheme.empty.labelHeight;
    const labelAlign = p.theme?.empty.labelAlign ?? activeTheme.empty.labelAlign;
    const visible = p.visible !== false;
    const iconWidth = p.theme?.empty.iconWidth ?? activeTheme.empty.iconWidth;
    const iconHeight = p.theme?.empty.iconHeight ?? activeTheme.empty.iconHeight;
    const font = theme.empty.font;
    const fontSize = p.theme?.empty.fontSize ?? activeTheme.empty.fontSize;
    const color = p.color ?? theme.empty.color;
    return (
        <view name="EmptyState" visible={visible}
            style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
            <image source={icon}
                style={{ position: 'absolute', left: left, top: top, width: iconWidth, height: iconHeight }} />
            <text value={label}
                style={{ position: 'absolute', left: labelLeft, top: labelTop, width: labelWidth, height: labelHeight,
                    font: font, fontSize: fontSize, color: color, bold: true,
                    horizontalAlign: labelAlign, verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
