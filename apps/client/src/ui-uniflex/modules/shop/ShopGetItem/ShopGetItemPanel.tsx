import { defineComponent, useEffect, useState } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { confirmButton } from '../../../components/button/buttonSkins';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { getItemConfig, ItemSlot } from '../../../gamecomponents/item/ItemSlot';
import { QuantityControl } from '../../../components/quantity/QuantityControl';
import { PopupFrame } from '../../../components/popup/PopupFrame';

export interface ShopGetItemPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly itemId?: string;
    readonly owned?: string | number;
    readonly currency?: 'gem' | 'medal';
    /** Initial quantity, reapplied on open, item change or an explicit quantity update. */
    readonly quantity?: number;
    readonly max?: number;
    readonly unitPrice?: number;
    readonly onClose?: () => void;
    readonly onChange?: (quantity: number) => void;
    readonly onBuy?: (quantity: number) => void;
}

export const ShopGetItemPanel = defineComponent<ShopGetItemPanelProps>((p) => {
    const limit = p.max ?? 10;
    const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
    const min = 0;
    const initial = p.quantity ?? 8;
    const initialQuantity = Number.isFinite(initial) ? Math.max(min, Math.min(max, Math.round(initial))) : min;
    const [storedQuantity, setQuantity] = useState(initialQuantity);
    const quantity = Math.max(min, Math.min(max, storedQuantity));
    const visible = p.visible !== false;
    // Hidden dialogs stay mounted: each open/item starts a fresh purchase selection.
    useEffect(() => {
        if (visible) setQuantity(initialQuantity);
    }, [visible, p.itemId, p.quantity]);
    // Persist a reduced limit so increasing it later does not restore an old selection.
    useEffect(() => {
        setQuantity((current) => Math.max(min, Math.min(max, current)));
    }, [max]);
    const setSafe = (next: number) => {
        const value = Number.isFinite(next) ? Math.max(min, Math.min(max, Math.round(next))) : min;
        setQuantity(value);
        p.onChange?.(value);
    };
    const price = String((p.unitPrice ?? 125) * quantity);
    const owned = String(p.owned ?? 99);
    const item = getItemConfig(p.itemId ?? 'gem');
    const isMedalPay = p.currency === 'medal';
    const payIcon = isMedalPay ? imageRef('ui/shop/price-medal') : imageRef('ui/shop/getitem-pay-gem');
    const payIconWidth = isMedalPay ? 44 : 64;
    const payIconHeight = isMedalPay ? 35 : 54;
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
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '获取道具'} left={21} top={502} width={708} height={620}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 502, width: 708, height: 620 }}>
                <ItemSlot left={18} top={119} itemId={p.itemId ?? 'gem'} count={owned} />
                <text value={item.name}
                    style={{ position: 'absolute', left: 191, top: 132, width: 470, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />
                <text value={item.description}
                    style={{ position: 'absolute', left: 191, top: 179, width: 470, height: 32,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#837A91', bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />

                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 13, top: 318, width: 683, height: 118, sizeMode: 'sliced' }} />
                <QuantityControl left={18} top={339} value={quantity} min={min} max={max}
                    onChange={setSafe} skin={qtySkin} />

                <view style={{ position: 'absolute', left: 226, top: 477, width: 255, height: 102 }}>
                    <ActionButton skin={confirmButton} label={price} icon={payIcon} iconWidth={payIconWidth} iconHeight={payIconHeight}
                        onClick={() => p.onBuy?.(quantity)} />
                </view>
            </view>
        </view>
    );
});
