import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { QuantityControl } from '../../components/quantity/QuantityControl';
import { CloseButton } from '../../components/popup/CloseButton';
import { PopupBackground } from '../../components/popup/PopupBackground';

export interface ShopGetItemPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly name?: string;
    readonly description?: string;
    readonly owned?: string | number;
    readonly quantity?: number;
    readonly max?: number;
    readonly unitPrice?: number;
    readonly onClose?: () => void;
    readonly onChange?: (quantity: number) => void;
    readonly onBuy?: (quantity: number) => void;
}

export const ShopGetItemPanel = defineComponent<ShopGetItemPanelProps>((p) => {
    const max = p.max ?? 10;
    const min = 0;
    const [quantity, setQuantity] = useState(p.quantity ?? 8);
    const setSafe = (next: number) => {
        const value = Math.max(min, Math.min(max, Math.round(next)));
        setQuantity(value);
        p.onChange?.(value);
    };
    const price = String((p.unitPrice ?? 125) * quantity);
    const owned = String(p.owned ?? 99);
    const payGem = imageRef('ui/shop/getitem-pay-gem');
    const qtyTrack = imageRef('ui/star-upgrade/progress-track');
    const qtyFill = imageRef('ui/star-upgrade/progress-fill');
    const qtyThumb = imageRef('ui/shop/getitem-thumb');
    const qtyBackground = imageRef('ui/alliance/input-bg');
    const qtyMax = imageRef('ui/shop/getitem-max');
    const qtySkin = {
        track: qtyTrack, fill: qtyFill, thumb: qtyThumb, qtyBackground, maxIcon: qtyMax,
        width: 669, trackWidth: 321, thumbWidth: 34, thumbHeight: 59,
        sliderLeft: 85, sliderTop: 9, sliderHeight: 59, trackTop: 9,
        fillLeft: 3, fillTop: 11, fillPad: 6, thumbTop: 0, plusLeft: 414,
        qtyLeft: 494, qtyTop: 11, qtyWidth: 94, qtyHeight: 64,
        qtyFontSize: 32, qtyColor: '#3F3254', qtyOutlineWidth: 0,
    };
    return (
        <view name="ShopGetItem" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624,
                justifyContent: 'center', alignItems: 'center' }}>
            <view name="ShopGetItem/Mask" interaction="press"
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#00000099' }} />
            <view name="ShopGetItem/Panel" style={{ width: 708, height: 620 }}>
                <PopupBackground kind="prompt" />
                <text value={p.title ?? '获取道具'}
                    style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58,
                        font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                        outlineColor: '#593D84', outlineWidth: 2,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <CloseButton onClick={p.onClose} />

                <image source={imageRef('ui/backpack/item-orange')}
                    style={{ position: 'absolute', left: 18, top: 119, width: 154, height: 159, sizeMode: 'sliced' }} />
                <image source={imageRef('ui/shop/getitem-icon')}
                    style={{ position: 'absolute', left: 31, top: 143, width: 129, height: 107 }} />
                <text value={owned}
                    style={{ position: 'absolute', left: 88, top: 226, width: 76, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: '#ffffff', bold: true,
                        outlineColor: '#3F3254', outlineWidth: 2,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />
                <text value={p.name ?? '高级钻石'}
                    style={{ position: 'absolute', left: 191, top: 132, width: 470, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />
                <text value={p.description ?? '可以购买好多东西'}
                    style={{ position: 'absolute', left: 191, top: 179, width: 470, height: 32,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#837A91', bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />

                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 13, top: 318, width: 683, height: 118, sizeMode: 'sliced' }} />
                <QuantityControl left={18} top={339} value={quantity} min={min} max={max}
                    onChange={setSafe} skin={qtySkin} />

                <view style={{ position: 'absolute', left: 226, top: 477, width: 255, height: 102 }}>
                    <ConfirmButton label={price} icon={payGem} iconWidth={64} iconHeight={54}
                        onClick={() => p.onBuy?.(quantity)} />
                </view>
            </view>
        </view>
    );
});
