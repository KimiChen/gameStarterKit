import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export const BackpackQuantityControl = defineComponent<{
    readonly value: number;
    readonly max: number;
    readonly onDecrease?: () => void;
    readonly onIncrease?: () => void;
    readonly onChange?: (value: number) => void;
}>((p) => {
    const trackWidth = 391;
    const handleWidth = 37;
    const minValue = 0;
    const ratio = p.max <= minValue
        ? 1
        : Math.max(0, Math.min(1, (p.value - minValue) / (p.max - minValue)));
    const handleLeft = ratio * (trackWidth - handleWidth);
    const fillWidth = Math.min(trackWidth - 2, handleLeft + handleWidth / 2);
    return (
        <view name="BackpackQuantityControl" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1225 }}>
            <view name="BackpackQuantity/Decrease" interaction="press" accessibilityLabel="减少数量" onClick={p.onDecrease}
                style={{ position: 'absolute', left: 25, top: 1118, width: 76, height: 85 }}>
                <image source={imageRef('ui/backpack/button-minus')} style={{ width: 76, height: 85 }} />
            </view>
            <view name="BackpackQuantity/Slider" interaction="range" accessibilityLabel="使用数量"
                value={p.value} min={minValue} max={p.max} step={1}
                // @ts-expect-error rangeWidth is consumed by the local UniFlex host extension.
                rangeWidth={trackWidth - handleWidth} onChange={p.onChange}
                style={{ position: 'absolute', left: 111, top: 1118, width: trackWidth, height: 85 }}>
                <image source={imageRef('ui/backpack/slider-track')}
                    style={{ position: 'absolute', left: 0, top: 18, width: 391, height: 44, sizeMode: 'sliced' }} />
                <image source={imageRef('ui/backpack/slider-fill')}
                    style={{ position: 'absolute', left: 2, top: 20, width: fillWidth, height: 40, sizeMode: 'sliced' }} />
                <image source={imageRef('ui/backpack/slider-handle')}
                    style={{ position: 'absolute', left: handleLeft, top: 6, width: 37, height: 71, sizeMode: 'sliced' }} />
            </view>
            <view name="BackpackQuantity/Increase" interaction="press" accessibilityLabel="增加数量" onClick={p.onIncrease}
                style={{ position: 'absolute', left: 511, top: 1118, width: 76, height: 85 }}>
                <image source={imageRef('ui/backpack/button-plus')} style={{ width: 76, height: 85 }} />
            </view>
            <image source={imageRef('ui/backpack/quantity-bg')}
                style={{ position: 'absolute', left: 604, top: 1132, width: 121, height: 54, sizeMode: 'sliced' }} />
            <text value={String(p.value)} style={{ position: 'absolute', left: 604, top: 1132, width: 121, height: 54,
                font: fontRef('fonts/regular', 700), fontSize: 33, color: '#FFFFFF', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
    );
});
