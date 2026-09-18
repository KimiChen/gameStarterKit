import { defineComponent } from '@uniflex/compiler';
import { fontRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';

export interface IconCaptionButtonProps {
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
    const left = p.left;
    const top = p.top;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    const width = p.width ?? iconWidth;
    const labelTop = p.labelTop ?? iconHeight;
    const labelHeight = p.labelHeight ?? 26;
    const fontSize = p.fontSize ?? 26;
    const color = p.color ?? '#ffffff';
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
                    font: fontRef('fonts/regular', 700), fontSize: fontSize, color: color, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
