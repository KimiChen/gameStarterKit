import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';
import type { ProgressBarSkin } from './ProgressBarSkin';

export interface ProgressBarProps {
    readonly theme?: ComponentTheme;
    readonly skin?: ProgressBarSkin;
    readonly track?: ImageRef;
    readonly fill?: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly fillWidth?: number;
    readonly value?: number;
    readonly max?: number;
    readonly visible?: boolean;
    readonly label?: string;
    readonly labelColor?: string;
    readonly labelSize?: number;
    readonly labelOutline?: string;
}

/** Track + sliced fill. `left`/`top` are parent-absolute. */
export const ProgressBar = defineComponent<ProgressBarProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const left = p.left;
    const top = p.top;
    const width = p.width;
    const height = p.height;
    const skin = p.skin;
    const track = p.track ?? skin?.track ?? theme.progress.track;
    const fill = p.fill ?? skin?.fill ?? theme.progress.fill;
    const visible = p.visible !== false;
    const inset = skin?.inset ?? theme.progress.inset;
    const inner = width - inset * 2;
    const fillHeight = height - inset * 2;
    const value = p.value;
    const max = p.max;
    const rawFill = p.fillWidth;
    const fromRatio = value != null && max != null && max > 0
        ? Math.round(inner * Math.max(0, Math.min(1, value / max)))
        : null;
    const fillWidth = fromRatio != null ? fromRatio : Math.max(0, Math.min(inner, rawFill ?? 0));
    const showFill = fillWidth > 0;
    const label = p.label ?? '';
    const showLabel = label !== '';
    const labelColor = p.labelColor ?? skin?.labelColor ?? theme.progress.color;
    const labelSize = p.labelSize ?? skin?.labelSize ?? theme.progress.labelSize;
    const labelOutline = p.labelOutline ?? skin?.labelOutline ?? theme.progress.outline;
    const outlineWidth = skin?.outlineWidth ?? theme.progress.outlineWidth;
    const font = theme.progress.font;
    return (
        <view name="ProgressBar" visible={visible}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={track}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, sizeMode: 'sliced' }} />
            <image visible={showFill} source={fill}
                style={{ position: 'absolute', left: inset, top: inset, width: fillWidth, height: fillHeight,
                    sizeMode: 'sliced' }} />
            <text visible={showLabel} value={label}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height,
                    font: font, fontSize: labelSize, color: labelColor, bold: true,
                    outlineColor: labelOutline, outlineWidth: outlineWidth,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
