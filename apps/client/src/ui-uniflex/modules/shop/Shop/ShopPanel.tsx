import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ResourceCounter } from '../../../gamecomponents/resource/ResourceCounter';
import { allianceTab, TabBar } from '../../../components/tab/TabBar';
import { ShopGetItemPanel } from '../ShopGetItem/ShopGetItemPanel';
import { ShopCard, type ShopGoods } from './ShopCard';

export type ShopTab = 'vip' | 'alliance' | 'gem';

export interface ShopPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly tab?: ShopTab;
    readonly currency?: string;
    readonly restockLabel?: string;
    readonly restockTime?: string;
    readonly vipGoods?: readonly ShopGoods[];
    readonly allianceGoods?: readonly ShopGoods[];
    readonly gemGoods?: readonly ShopGoods[];
    readonly onBack?: () => void;
    readonly onAction?: (id: string) => void;
    readonly onSelectTab?: (tab: ShopTab) => void;
}

const CARD_W = 223;
const CARD_H = 302;

const goods = (
    id: string,
    itemId: string,
    owned: string,
    price: string,
    unitPrice: number,
    currency: ShopGoods['currency'],
    width: number,
    height: number,
    extra?: Pick<ShopGoods, 'max' | 'stock' | 'discount' | 'lock'>,
): ShopGoods => ({
    id, itemId, owned, price, unitPrice, currency, width, height,
    max: extra?.max, stock: extra?.stock, discount: extra?.discount, lock: extra?.lock,
});

const defaultVip: readonly ShopGoods[] = [
    goods('vip-egg', 'egg', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '100/200', discount: '-60%' }),
    goods('vip-cube', 'cube', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '100/200', discount: '-60%' }),
    goods('vip-axe', 'axe', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '100/200', discount: '-60%' }),
    goods('vip-gem-1', 'gem', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '5/5', discount: '-60%', lock: 'VIP1解锁' }),
    goods('vip-gem-2', 'gem', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '5/5', discount: '-60%', lock: 'VIP3解锁' }),
    goods('vip-gem-3', 'gem', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '5/5', discount: '-60%', lock: 'VIP5解锁' }),
    goods('vip-egg-2', 'egg', '64', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '80/200', discount: '-40%' }),
    goods('vip-meat', 'meat', '32', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '12/50', discount: '-20%' }),
    goods('vip-book', 'book', '8', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '4/10' }),
    goods('vip-scroll-2', 'scroll-red', '15', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '9/30', discount: '-30%' }),
    goods('vip-meat-2', 'meat', '21', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '10/40' }),
    goods('vip-egg-3', 'egg', '5', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '1/10', discount: '-50%' }),
];

const defaultAlliance: readonly ShopGoods[] = [
    goods('ally-crate', 'crate', '99', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '100/200' }),
    goods('ally-meat-1', 'meat', '99', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '100/200' }),
    goods('ally-meat-2', 'meat', '99', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '100/200' }),
    goods('ally-egg', 'egg', '18', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '6/20' }),
    goods('ally-scroll', 'scroll', '11', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '3/15' }),
    goods('ally-book', 'book-blue', '7', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '2/10' }),
    goods('ally-meat-3', 'meat', '14', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '8/40' }),
    goods('ally-scroll-2', 'scroll', '6', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '4/12' }),
    goods('ally-egg-2', 'egg', '3', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '1/8' }),
];

const defaultGem: readonly ShopGoods[] = [
    goods('gem-book', 'book-orange', '99', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-helm', 'helm', '99', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-scroll', 'scroll', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { discount: '500' }),
    goods('gem-egg', 'egg', '40', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-meat', 'meat', '22', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-book-2', 'book-blue', '9', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-scroll-2', 'scroll', '5', '20', 20, 'gem', CARD_W, CARD_H,
        { discount: '200' }),
    goods('gem-egg-2', 'egg', '16', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-meat-2', 'meat', '11', '20', 20, 'gem', CARD_W, CARD_H),
];

export const ShopPanel = defineComponent<ShopPanelProps>((p) => {
    const [tab, setTab] = useState<ShopTab>(p.tab ?? 'vip');
    const [buyOpen, setBuyOpen] = useState(false);
    const [buyGoods, setBuyGoods] = useState<ShopGoods | null>(null);
    const vipGoods = p.vipGoods ?? defaultVip;
    const allianceGoods = p.allianceGoods ?? defaultAlliance;
    const gemGoods = p.gemGoods ?? defaultGem;
    const isVip = tab === 'vip';
    const isAlliance = tab === 'alliance';
    const isGem = tab === 'gem';
    const cards = isVip ? vipGoods : isAlliance ? allianceGoods : gemGoods;
    const cardHeight = CARD_H;
    const listLeft = 25;
    const listTop = 373;
    const listWidth = 707;
    const gap = 20;
    const crossGap = 19;
    const showRestock = !isGem;
    const showMedal = isAlliance;
    const diamondIcon = imageRef('ui/backpack/resource-diamond');
    const medalIcon = imageRef('ui/shop/res-medal');
    const currencyIcon = showMedal ? medalIcon : diamondIcon;
    const currencyLeft = showMedal ? 6 : 8;
    const currencyTop = showMedal ? 9 : 6;
    const currencyWidth = showMedal ? 40 : 37;
    const currencyValue = p.currency ?? '999.99k';
    const addCurrency = () => p.onAction?.('add_currency');
    const source = useMemo(() => new ArrayVirtualListDataSource(cards), [cards]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    const selectTab = (next: ShopTab) => {
        setTab(next);
        setBuyOpen(false);
        p.onSelectTab?.(next);
        p.onAction?.(`tab:${next}`);
    };
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    const clickCard = (item: ShopGoods) => {
        if (item.lock) {
            p.onAction?.(`locked:${item.id}`);
            return;
        }
        setBuyGoods(item);
        setBuyOpen(true);
        p.onAction?.(`buy:${item.id}`);
    };
    const closeBuy = () => setBuyOpen(false);
    return (
        <view name="Shop" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#000000' }}>
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 199, width: 750, height: 1425, backgroundColor: '#413360' }} />
            <image source={imageRef('ui/shop/awning')}
                style={{ position: 'absolute', left: 0, top: 145, width: 750, height: 128 }} />
            <text value={p.title ?? '商店'}
                style={{ position: 'absolute', left: 20, top: 160, width: 200, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />

            <ResourceCounter icon={currencyIcon} left={597} top={180} value={currencyValue}
                backgroundLeft={11} backgroundTop={7}
                iconLeft={currencyLeft} iconTop={currencyTop} iconWidth={currencyWidth}
                valueLeft={50} valueTop={7} valueWidth={99}
                onClick={addCurrency} />

            <image source={imageRef('ui/shop/panel')}
                style={{ position: 'absolute', left: 8, top: 354, width: 734, height: 1160, sizeMode: 'sliced' }} />
            <VirtualList source={source} key="id" layout="grid" lanes={3}
                direction="vertical" itemSize={cardHeight} gap={gap} crossGap={crossGap} overscan={1}
                controller={list} inertia elastic
                style={{ position: 'absolute', left: listLeft, top: listTop, width: listWidth, height: 1141 }}>
                {(item) => <ShopCard goods={item} onClick={() => clickCard(item)} />}
            </VirtualList>

            <TabBar skin={allianceTab} left={24} top={302} itemWidth={200} gap={13} width={726} selected={tab}
                items={[{ id: 'vip', label: 'VIP商店' }, { id: 'alliance', label: '联盟每周商店' }, { id: 'gem', label: '宝石商店' }]}
                onSelect={(id) => { if (id === 'vip' || id === 'alliance' || id === 'gem') selectTab(id); }} />

            <ScreenFooter onBack={back} />
            <text visible={showRestock} value={p.restockLabel ?? '每周一补货'}
                style={{ position: 'absolute', left: 300, bottom: 60, width: 149, height: 30,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#ffffff', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image visible={showRestock} source={imageRef('ui/shop/clock')}
                style={{ position: 'absolute', left: 248, bottom: 14, width: 35, height: 42 }} />
            <text visible={showRestock} value={p.restockTime ?? '4天17:35:26'}
                style={{ position: 'absolute', left: 289, bottom: 19, width: 173, height: 27,
                    font: fontRef('fonts/regular', 700), fontSize: 24, color: '#ffffff', bold: true,
                    verticalAlign: 'center', overflow: 'shrink' }} />
            <view visible={isGem} interaction="press" onClick={() => p.onAction?.('open_emoji')}
                style={{ position: 'absolute', left: 521, bottom: 29, width: 59, height: 60 }}>
                <image source={imageRef('ui/alliance/board-emoji')}
                    style={{ width: 59, height: 60 }} />
            </view>
            <view visible={isGem} interaction="press" onClick={() => p.onAction?.('send_message')}
                style={{ position: 'absolute', left: 589, bottom: 19, width: 154, height: 77 }}>
                <image source={imageRef('ui/alliance/board-send')}
                    style={{ width: 154, height: 77 }} />
            </view>

            <ShopGetItemPanel visible={buyOpen} itemId={buyGoods?.itemId}
                currency={buyGoods?.currency}
                owned={buyGoods?.owned} unitPrice={buyGoods?.unitPrice} max={buyGoods?.max} onClose={closeBuy}
                onBuy={(quantity) => {
                    p.onAction?.(`confirm_buy:${buyGoods?.id}:${quantity}`);
                    closeBuy();
                }} />
        </view>
    );
});
