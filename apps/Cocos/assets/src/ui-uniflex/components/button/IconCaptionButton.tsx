import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface IconCaptionButtonProps {
    readonly theme?: ComponentTheme;
    readonly icon: ImageRef;
    readonly label: string;
    readonly left: number;
    readonly top: number;
    readonly iconWidth: number;
    readonly iconHeight: number;
    readonly width?: number;
    readonly labelTop?: number;
    readonly labelHeight?: number;
    readonly fontSize?: number;
    readonly color?: string;
    readonly onClick?: () => void;
}

/** Icon above, caption below. Hit area covers both; the icon stays at its own size. */
export const IconCaptionButton = defineComponent<IconCaptionButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const left = p.left;
    const top = p.top;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    const width = p.width ?? iconWidth;
    const labelTop = p.labelTop ?? iconHeight;
    const labelHeight = p.labelHeight ?? p.theme?.iconCaption.labelHeight ?? activeTheme.iconCaption.labelHeight;
    const fontSize = p.fontSize ?? p.theme?.iconCaption.fontSize ?? activeTheme.iconCaption.fontSize;
    const labelAlign = p.theme?.iconCaption.labelAlign ?? activeTheme.iconCaption.labelAlign;
    const color = p.color ?? theme.iconCaption.color;
    const height = labelTop + labelHeight;
    const iconLeft = (width - iconWidth) / 2;
    const label = p.label;
    return (
        <view name="IconCaptionButton" interaction="press" onClick={() => p.onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <view style={{ position: 'absolute', left: iconLeft, top: 0, width: iconWidth, height: iconHeight }}>
                <image source={p.icon} style={{ width: iconWidth, height: iconHeight }} />
            </view>
            <text value={label}
                style={{ position: 'absolute', left: 0, top: labelTop, width: width, height: labelHeight,
                    font: theme.iconCaption.font, fontSize: fontSize, color: color, bold: true,
                    horizontalAlign: labelAlign, verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
