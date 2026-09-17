import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ItemSlot } from '../../components/item/ItemSlot';

export type ShopQuality = 'red' | 'blue' | 'purple' | 'orange';
export type ShopIcon = 'egg' | 'meat' | 'book' | 'scroll' | 'gem';
export type ShopCurrency = 'gem' | 'medal';

export interface ShopGoods {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly icon: ShopIcon;
    readonly quality: ShopQuality;
    readonly owned: string;
    readonly price: string;
    readonly unitPrice: number;
    readonly currency: ShopCurrency;
    readonly width: number;
    readonly height: number;
    readonly stock?: string;
    readonly discount?: string;
    readonly lock?: string;
}

export interface ShopCardProps {
    readonly goods: ShopGoods;
    readonly onClick?: () => void;
}

export const ShopCard = defineComponent<ShopCardProps>((p) => {
    const goods = p.goods;
    const width = goods.width;
    const height = goods.height;
    const icon = goods.icon;
    const isEgg = icon === 'egg';
    const isMeat = icon === 'meat';
    const isBook = icon === 'book';
    const isScroll = icon === 'scroll';
    const eggIcon = imageRef('ui/shop/item-egg');
    const meatIcon = imageRef('ui/shop/item-meat');
    const bookIcon = imageRef('ui/shop/item-book');
    const scrollIcon = imageRef('ui/shop/item-scroll');
    const gemIcon = imageRef('ui/shop/getitem-icon');
    const itemIcon = isEgg ? eggIcon : isMeat ? meatIcon : isBook ? bookIcon : isScroll ? scrollIcon : gemIcon;
    const quality = goods.quality;
    const owned = goods.owned;
    const locked = goods.lock != null && goods.lock !== '';
    const buyable = !locked;
    const stock = goods.stock ?? '';
    const hasStock = stock !== '';
    const discount = goods.discount ?? '';
    const hasDiscount = discount !== '';
    const isGemPay = goods.currency === 'gem';
    const buybarTop = 234;
    const buybarHeight = 63;
    const payGap = 4;
    const priceWidth = Math.max(36, goods.price.length * 20);
    const gemPayIcon = imageRef('ui/shop/getitem-icon');
    const medalPayIcon = imageRef('ui/shop/price-medal');
    const payIcon = isGemPay ? gemPayIcon : medalPayIcon;
    const payIconWidth = isGemPay ? 42 : 44;
    const payIconHeight = isGemPay ? 36 : 35;
    const lockText = goods.lock ?? '';
    const showPay = buyable;
    return (
        <view name="ShopCard" interaction="press" onClick={() => p.onClick?.()}
            style={{ position: 'relative', width: width, height: height }}>
            <image source={imageRef('ui/shop/card-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />
            <image source={imageRef('ui/shop/card-buybar')}
                style={{ position: 'absolute', left: 0, top: buybarTop, width: width, height: buybarHeight, sizeMode: 'sliced' }} />
            <ItemSlot left={24} top={25} quality={quality} icon={itemIcon} count={owned} />
            <text visible={hasStock} value={stock}
                style={{ position: 'absolute', left: 20, top: 188, width: 190, height: 36,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <view visible={showPay}
                style={{ position: 'absolute', left: 0, top: buybarTop, width: width, height: buybarHeight,
                    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: payGap }}>
                <image source={payIcon}
                    style={{ width: payIconWidth, height: payIconHeight }} />
                <text value={goods.price}
                    style={{ width: priceWidth, height: 40,
                        font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />
            </view>
            <text visible={locked} value={lockText}
                style={{ position: 'absolute', left: 10, top: buybarTop, width: 210, height: buybarHeight,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#EF4B4B', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image visible={hasDiscount} source={imageRef('ui/shop/discount')}
                style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 66 }} />
            <view visible={hasDiscount} name="rot:-29"
                style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 66 }}>
                <text value={discount}
                    style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 66,
                        font: fontRef('fonts/regular', 700), fontSize: 20, lineHeight: 22, color: '#ffffff', bold: true,
                        outlineColor: '#4E1F15', outlineWidth: 2, wrap: false,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    );
});
