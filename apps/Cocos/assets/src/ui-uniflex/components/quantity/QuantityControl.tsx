import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface QuantityControlSkin {
    readonly minus?: ImageRef;
    readonly plus?: ImageRef;
    readonly track?: ImageRef;
    readonly fill?: ImageRef;
    readonly thumb?: ImageRef;
    readonly qtyBackground?: ImageRef;
    readonly maxIcon?: ImageRef;
    readonly width?: number;
    readonly trackWidth?: number;
    readonly thumbWidth?: number;
    readonly thumbHeight?: number;
    readonly sliderLeft?: number;
    readonly sliderTop?: number;
    readonly sliderHeight?: number;
    readonly trackTop?: number;
    readonly fillLeft?: number;
    readonly fillTop?: number;
    readonly fillPad?: number;
    readonly thumbTop?: number;
    readonly plusLeft?: number;
    readonly qtyLeft?: number;
    readonly qtyTop?: number;
    readonly qtyWidth?: number;
    readonly qtyHeight?: number;
    readonly qtyFontSize?: number;
    readonly qtyColor?: string;
    readonly qtyOutlineColor?: string;
    readonly qtyOutlineWidth?: number;
}

export interface QuantityControlProps {
    readonly theme?: ComponentTheme;
    readonly left: number;
    readonly top: number;
    readonly value: number;
    readonly min?: number;
    readonly max: number;
    readonly onChange?: (value: number) => void;
    readonly onDecrease?: () => void;
    readonly onIncrease?: () => void;
    readonly skin?: QuantityControlSkin;
}

/** Default minus / slider / plus / value. Pass `skin` only to replace images or metrics. */
export const QuantityControl = defineComponent<QuantityControlProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const skin = p.skin;
    const left = p.left;
    const top = p.top;
    const min = p.min ?? 0;
    const max = p.max;
    const value = p.value;
    const onChange = p.onChange;
    const minus = skin?.minus ?? theme.quantity.minus;
    const plus = skin?.plus ?? theme.quantity.plus;
    const track = skin?.track ?? theme.quantity.track;
    const fill = skin?.fill ?? theme.quantity.fill;
    const thumb = skin?.thumb ?? theme.quantity.thumb;
    const qtyBg = skin?.qtyBackground ?? theme.quantity.qtyBackground;
    const maxIcon = skin?.maxIcon;
    const showMax = maxIcon != null;
    const maxSource = maxIcon ?? minus;
    const width = skin?.width ?? p.theme?.quantity.width ?? activeTheme.quantity.width;
    const height = p.theme?.quantity.height ?? activeTheme.quantity.height;
    const buttonWidth = p.theme?.quantity.buttonWidth ?? activeTheme.quantity.buttonWidth;
    const trackWidth = skin?.trackWidth ?? p.theme?.quantity.trackWidth ?? activeTheme.quantity.trackWidth;
    const thumbWidth = skin?.thumbWidth ?? p.theme?.quantity.thumbWidth ?? activeTheme.quantity.thumbWidth;
    const thumbHeight = skin?.thumbHeight ?? p.theme?.quantity.thumbHeight ?? activeTheme.quantity.thumbHeight;
    const sliderLeft = skin?.sliderLeft ?? p.theme?.quantity.sliderLeft ?? activeTheme.quantity.sliderLeft;
    const sliderTop = skin?.sliderTop ?? p.theme?.quantity.sliderTop ?? activeTheme.quantity.sliderTop;
    const sliderHeight = skin?.sliderHeight ?? p.theme?.quantity.sliderHeight ?? activeTheme.quantity.sliderHeight;
    const trackTop = skin?.trackTop ?? p.theme?.quantity.trackTop ?? activeTheme.quantity.trackTop;
    const trackHeight = p.theme?.quantity.trackHeight ?? activeTheme.quantity.trackHeight;
    const fillLeft = skin?.fillLeft ?? p.theme?.quantity.fillLeft ?? activeTheme.quantity.fillLeft;
    const fillTop = skin?.fillTop ?? p.theme?.quantity.fillTop ?? activeTheme.quantity.fillTop;
    const fillHeight = p.theme?.quantity.fillHeight ?? activeTheme.quantity.fillHeight;
    const fillPad = skin?.fillPad ?? p.theme?.quantity.fillPad ?? activeTheme.quantity.fillPad;
    const thumbTop = skin?.thumbTop ?? p.theme?.quantity.thumbTop ?? activeTheme.quantity.thumbTop;
    const plusLeft = skin?.plusLeft ?? p.theme?.quantity.plusLeft ?? activeTheme.quantity.plusLeft;
    const qtyLeft = skin?.qtyLeft ?? p.theme?.quantity.qtyLeft ?? activeTheme.quantity.qtyLeft;
    const qtyTop = skin?.qtyTop ?? p.theme?.quantity.qtyTop ?? activeTheme.quantity.qtyTop;
    const qtyWidth = skin?.qtyWidth ?? p.theme?.quantity.qtyWidth ?? activeTheme.quantity.qtyWidth;
    const qtyHeight = skin?.qtyHeight ?? p.theme?.quantity.qtyHeight ?? activeTheme.quantity.qtyHeight;
    const qtyFontSize = skin?.qtyFontSize ?? p.theme?.quantity.qtyFontSize ?? activeTheme.quantity.qtyFontSize;
    const qtyColor = skin?.qtyColor ?? theme.quantity.color;
    const qtyOutlineColor = skin?.qtyOutlineColor ?? theme.quantity.outline;
    const qtyOutlineWidth = skin?.qtyOutlineWidth ?? p.theme?.quantity.outlineWidth ?? activeTheme.quantity.outlineWidth;
    const maxLeft = p.theme?.quantity.maxLeft ?? activeTheme.quantity.maxLeft;
    const qtyFont = theme.quantity.font;
    const rangeWidth = trackWidth - thumbWidth;
    const span = max - min;
    const ratio = span <= 0 ? 1 : Math.max(0, Math.min(1, (value - min) / span));
    const handleLeft = ratio * rangeWidth;
    const fillWidth = Math.min(trackWidth - fillPad, handleLeft + thumbWidth / 2);
    const showFill = fillWidth > 0;
    const qtyText = String(value);
    const decrease = () => {
        if (p.onDecrease) p.onDecrease();
        else onChange?.(Math.max(min, Math.round(value) - 1));
    };
    const increase = () => {
        if (p.onIncrease) p.onIncrease();
        else onChange?.(Math.min(max, Math.round(value) + 1));
    };
    const setMax = () => onChange?.(max);
    return (
        <view name="QuantityControl" style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <view name="QuantityControl/Decrease" interaction="press" accessibilityLabel="减少数量" onClick={decrease}
                style={{ position: 'absolute', left: 0, top: 0, width: buttonWidth, height: height }}>
                <image source={minus} style={{ width: buttonWidth, height: height }} />
            </view>
            <view name="QuantityControl/Slider" interaction="range" accessibilityLabel="数量"
                value={value} min={min} max={max} step={1}
                // @ts-expect-error rangeWidth is consumed by the local UniFlex host extension.
                rangeWidth={rangeWidth} onChange={onChange}
                style={{ position: 'absolute', left: sliderLeft, top: sliderTop, width: trackWidth, height: sliderHeight }}>
                <image source={track}
                    style={{ position: 'absolute', left: 0, top: trackTop, width: trackWidth, height: trackHeight, sizeMode: 'sliced' }} />
                <image visible={showFill} source={fill}
                    style={{ position: 'absolute', left: fillLeft, top: fillTop, width: fillWidth, height: fillHeight, sizeMode: 'sliced' }} />
                <image source={thumb}
                    style={{ position: 'absolute', left: handleLeft, top: thumbTop, width: thumbWidth, height: thumbHeight, sizeMode: 'sliced' }} />
            </view>
            <view name="QuantityControl/Increase" interaction="press" accessibilityLabel="增加数量" onClick={increase}
                style={{ position: 'absolute', left: plusLeft, top: 0, width: buttonWidth, height: height }}>
                <image source={plus} style={{ width: buttonWidth, height: height }} />
            </view>
            <image source={qtyBg}
                style={{ position: 'absolute', left: qtyLeft, top: qtyTop, width: qtyWidth, height: qtyHeight, sizeMode: 'sliced' }} />
            <text value={qtyText}
                style={{ position: 'absolute', left: qtyLeft, top: qtyTop, width: qtyWidth, height: qtyHeight,
                    font: qtyFont, fontSize: qtyFontSize, color: qtyColor, bold: true,
                    outlineColor: qtyOutlineColor, outlineWidth: qtyOutlineWidth,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view visible={showMax} name="QuantityControl/Max" interaction="press" accessibilityLabel="最大数量" onClick={setMax}
                style={{ position: 'absolute', left: maxLeft, top: 0, width: buttonWidth, height: height }}>
                <image source={maxSource} style={{ width: buttonWidth, height: height }} />
            </view>
        </view>
    );
});
