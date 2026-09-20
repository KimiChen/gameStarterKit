import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';

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
    const skin = p.skin;
    const left = p.left;
    const top = p.top;
    const min = p.min ?? 0;
    const max = p.max;
    const value = p.value;
    const onChange = p.onChange;
    const minus = skin?.minus ?? imageRef('ui/backpack/button-minus');
    const plus = skin?.plus ?? imageRef('ui/backpack/button-plus');
    const track = skin?.track ?? imageRef('ui/backpack/slider-track');
    const fill = skin?.fill ?? imageRef('ui/backpack/slider-fill');
    const thumb = skin?.thumb ?? imageRef('ui/backpack/slider-handle');
    const qtyBg = skin?.qtyBackground ?? imageRef('ui/backpack/quantity-bg');
    const maxIcon = skin?.maxIcon;
    const showMax = maxIcon != null;
    const maxSource = maxIcon ?? minus;
    const width = skin?.width ?? 700;
    const trackWidth = skin?.trackWidth ?? 391;
    const thumbWidth = skin?.thumbWidth ?? 37;
    const thumbHeight = skin?.thumbHeight ?? 71;
    const sliderLeft = skin?.sliderLeft ?? 86;
    const sliderTop = skin?.sliderTop ?? 0;
    const sliderHeight = skin?.sliderHeight ?? 85;
    const trackTop = skin?.trackTop ?? 18;
    const fillLeft = skin?.fillLeft ?? 2;
    const fillTop = skin?.fillTop ?? 20;
    const fillPad = skin?.fillPad ?? 2;
    const thumbTop = skin?.thumbTop ?? 6;
    const plusLeft = skin?.plusLeft ?? 486;
    const qtyLeft = skin?.qtyLeft ?? 579;
    const qtyTop = skin?.qtyTop ?? 14;
    const qtyWidth = skin?.qtyWidth ?? 121;
    const qtyHeight = skin?.qtyHeight ?? 54;
    const qtyFontSize = skin?.qtyFontSize ?? 33;
    const qtyColor = skin?.qtyColor ?? '#FFFFFF';
    const qtyOutlineColor = skin?.qtyOutlineColor ?? '#000000';
    const qtyOutlineWidth = skin?.qtyOutlineWidth ?? 2;
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
        <view name="QuantityControl" style={{ position: 'absolute', left: left, top: top, width: width, height: 85 }}>
            <view name="QuantityControl/Decrease" interaction="press" accessibilityLabel="减少数量" onClick={decrease}
                style={{ position: 'absolute', left: 0, top: 0, width: 76, height: 85 }}>
                <image source={minus} style={{ width: 76, height: 85 }} />
            </view>
            <view name="QuantityControl/Slider" interaction="range" accessibilityLabel="数量"
                value={value} min={min} max={max} step={1}
                // @ts-expect-error rangeWidth is consumed by the local UniFlex host extension.
                rangeWidth={rangeWidth} onChange={onChange}
                style={{ position: 'absolute', left: sliderLeft, top: sliderTop, width: trackWidth, height: sliderHeight }}>
                <image source={track}
                    style={{ position: 'absolute', left: 0, top: trackTop, width: trackWidth, height: 44, sizeMode: 'sliced' }} />
                <image visible={showFill} source={fill}
                    style={{ position: 'absolute', left: fillLeft, top: fillTop, width: fillWidth, height: 40, sizeMode: 'sliced' }} />
                <image source={thumb}
                    style={{ position: 'absolute', left: handleLeft, top: thumbTop, width: thumbWidth, height: thumbHeight, sizeMode: 'sliced' }} />
            </view>
            <view name="QuantityControl/Increase" interaction="press" accessibilityLabel="增加数量" onClick={increase}
                style={{ position: 'absolute', left: plusLeft, top: 0, width: 76, height: 85 }}>
                <image source={plus} style={{ width: 76, height: 85 }} />
            </view>
            <image source={qtyBg}
                style={{ position: 'absolute', left: qtyLeft, top: qtyTop, width: qtyWidth, height: qtyHeight, sizeMode: 'sliced' }} />
            <text value={qtyText}
                style={{ position: 'absolute', left: qtyLeft, top: qtyTop, width: qtyWidth, height: qtyHeight,
                    font: fontRef('fonts/regular', 700), fontSize: qtyFontSize, color: qtyColor, bold: true,
                    outlineColor: qtyOutlineColor, outlineWidth: qtyOutlineWidth,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view visible={showMax} name="QuantityControl/Max" interaction="press" accessibilityLabel="最大数量" onClick={setMax}
                style={{ position: 'absolute', left: 593, top: 0, width: 76, height: 85 }}>
                <image source={maxSource} style={{ width: 76, height: 85 }} />
            </view>
        </view>
    );
});
