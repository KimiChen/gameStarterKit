import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface ProgressBarProps {
    readonly theme?: ComponentTheme;
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

/** Track + sliced fill. Callers inject skins; `left`/`top` are parent-absolute. */
export const ProgressBar = defineComponent<ProgressBarProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const left = p.left;
    const top = p.top;
    const width = p.width;
    const height = p.height;
    const track = p.track ?? theme.progress.track;
    const fill = p.fill ?? theme.progress.fill;
    const visible = p.visible !== false;
    const inset = p.theme?.progress.inset ?? activeTheme.progress.inset;
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
    const labelColor = p.labelColor ?? theme.progress.color;
    const labelSize = p.labelSize ?? p.theme?.progress.labelSize ?? activeTheme.progress.labelSize;
    const labelOutline = p.labelOutline ?? theme.progress.outline;
    const outlineWidth = p.theme?.progress.outlineWidth ?? activeTheme.progress.outlineWidth;
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
