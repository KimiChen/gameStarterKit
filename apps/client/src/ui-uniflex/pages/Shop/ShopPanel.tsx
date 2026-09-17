import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../kits/uniflex/api/core/index';
import { PanelTab } from '../../components/tab/PanelTab';
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
    name: string,
    description: string,
    icon: ShopGoods['icon'],
    quality: ShopGoods['quality'],
    owned: string,
    price: string,
    unitPrice: number,
    currency: ShopGoods['currency'],
    width: number,
    height: number,
    extra?: Pick<ShopGoods, 'stock' | 'discount' | 'lock'>,
): ShopGoods => ({
    id, name, description, icon, quality, owned, price, unitPrice, currency, width, height,
    stock: extra?.stock, discount: extra?.discount, lock: extra?.lock,
});

const defaultVip: readonly ShopGoods[] = [
    goods('vip-egg', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '100/200', discount: '-60%' }),
    goods('vip-cube', '秘能立方', '蕴含稳定魔力的合成核心。', 'book', 'orange', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '100/200', discount: '-60%' }),
    goods('vip-axe', '霜风战斧', '可用于强化英雄装备。', 'scroll', 'purple', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '100/200', discount: '-60%' }),
    goods('vip-gem-1', '高级钻石', '可以购买好多东西', 'gem', 'blue', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '5/5', discount: '-60%', lock: 'VIP1解锁' }),
    goods('vip-gem-2', '高级钻石', '可以购买好多东西', 'gem', 'blue', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '5/5', discount: '-60%', lock: 'VIP3解锁' }),
    goods('vip-gem-3', '高级钻石', '可以购买好多东西', 'gem', 'blue', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '5/5', discount: '-60%', lock: 'VIP5解锁' }),
    goods('vip-egg-2', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '64', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '80/200', discount: '-40%' }),
    goods('vip-meat', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '32', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '12/50', discount: '-20%' }),
    goods('vip-book', '秘典', '提升英雄技能的读物。', 'book', 'purple', '8', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '4/10' }),
    goods('vip-scroll-2', '卷轴', '联盟科技所需的研究卷轴。', 'scroll', 'red', '15', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '9/30', discount: '-30%' }),
    goods('vip-meat-2', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '21', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '10/40' }),
    goods('vip-egg-3', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '5', '20', 20, 'gem', CARD_W, CARD_H,
        { stock: '1/10', discount: '-50%' }),
];

const defaultAlliance: readonly ShopGoods[] = [
    goods('ally-crate', '联盟补给箱', '每周联盟商店可兑换的物资。', 'book', 'orange', '99', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '100/200' }),
    goods('ally-meat-1', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '99', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '100/200' }),
    goods('ally-meat-2', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '99', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '100/200' }),
    goods('ally-egg', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '18', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '6/20' }),
    goods('ally-scroll', '卷轴', '联盟科技所需的研究卷轴。', 'scroll', 'purple', '11', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '3/15' }),
    goods('ally-book', '秘典', '提升英雄技能的读物。', 'book', 'blue', '7', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '2/10' }),
    goods('ally-meat-3', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '14', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '8/40' }),
    goods('ally-scroll-2', '卷轴', '联盟科技所需的研究卷轴。', 'scroll', 'purple', '6', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '4/12' }),
    goods('ally-egg-2', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '3', '20', 20, 'medal', CARD_W, CARD_H,
        { stock: '1/8' }),
];

const defaultGem: readonly ShopGoods[] = [
    goods('gem-book', '秘典', '提升英雄技能的读物。', 'book', 'orange', '99', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-helm', '勇士盔', '可用于强化英雄装备。', 'meat', 'orange', '99', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-scroll', '卷轴', '联盟科技所需的研究卷轴。', 'scroll', 'purple', '99', '20', 20, 'gem', CARD_W, CARD_H,
        { discount: '500' }),
    goods('gem-egg', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '40', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-meat', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '22', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-book-2', '秘典', '提升英雄技能的读物。', 'book', 'blue', '9', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-scroll-2', '卷轴', '联盟科技所需的研究卷轴。', 'scroll', 'purple', '5', '20', 20, 'gem', CARD_W, CARD_H,
        { discount: '200' }),
    goods('gem-egg-2', '火蛋', '可在商店兑换的稀有孵化材料。', 'egg', 'red', '16', '20', 20, 'gem', CARD_W, CARD_H),
    goods('gem-meat-2', '烤肉', '联盟补给用的食材。', 'meat', 'orange', '11', '20', 20, 'gem', CARD_W, CARD_H),
];

export const ShopPanel = defineComponent<ShopPanelProps>((p) => {
    const [tab, setTab] = useState<ShopTab>(p.tab ?? 'vip');
    const [buyOpen, setBuyOpen] = useState(false);
    const [buyId, setBuyId] = useState('');
    const [buyName, setBuyName] = useState('');
    const [buyDesc, setBuyDesc] = useState('');
    const [buyOwned, setBuyOwned] = useState('99');
    const [buyPrice, setBuyPrice] = useState(20);
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
        setBuyId(item.id);
        setBuyName(item.name);
        setBuyDesc(item.description);
        setBuyOwned(item.owned);
        setBuyPrice(item.unitPrice);
        setBuyOpen(true);
        p.onAction?.(`buy:${item.id}`);
    };
    const closeBuy = () => setBuyOpen(false);
    return (
        <view name="Shop" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#000000' }}>
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 199, width: 750, height: 1281, backgroundColor: '#413360' }} />
            <image source={imageRef('ui/shop/awning')}
                style={{ position: 'absolute', left: 0, top: 145, width: 750, height: 128 }} />
            <text value={p.title ?? '商店'}
                style={{ position: 'absolute', left: 20, top: 160, width: 200, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />

            <view interaction="press" onClick={() => p.onAction?.('add_currency')}
                style={{ position: 'absolute', left: 597, top: 180, width: 153, height: 45 }}>
                <image source={imageRef('ui/backpack/resource-bg')}
                    style={{ position: 'absolute', left: 11, top: 7, width: 138, height: 32, sizeMode: 'sliced' }} />
                <image visible={!showMedal} source={imageRef('ui/backpack/resource-diamond')}
                    style={{ position: 'absolute', left: 8, top: 6, width: 37, height: 31 }} />
                <image visible={showMedal} source={imageRef('ui/shop/res-medal')}
                    style={{ position: 'absolute', left: 6, top: 9, width: 40, height: 31 }} />
                <image source={imageRef('ui/shop/res-plus')}
                    style={{ position: 'absolute', left: 27, top: 19, width: 20, height: 21 }} />
                <text value={p.currency ?? '999.99k'}
                    style={{ position: 'absolute', left: 50, top: 7, width: 99, height: 32,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#ffffff', bold: true,
                        outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center', overflow: 'shrink' }} />
            </view>

            <image source={imageRef('ui/shop/panel')}
                style={{ position: 'absolute', left: 8, top: 354, width: 734, height: 1032, sizeMode: 'sliced' }} />
            <VirtualList source={source} key="id" layout="grid" lanes={3}
                direction="vertical" itemSize={cardHeight} gap={gap} crossGap={crossGap} overscan={1}
                controller={list} inertia elastic
                style={{ position: 'absolute', left: listLeft, top: listTop, width: listWidth, height: 1000 }}>
                {(item) => <ShopCard goods={item} onClick={() => clickCard(item)} />}
            </VirtualList>

            <PanelTab label="VIP商店" active={isVip} left={24} top={302} width={200} kind="alliance"
                onClick={() => selectTab('vip')} />
            <PanelTab label="联盟每周商店" active={isAlliance} left={237} top={302} width={200} kind="alliance"
                onClick={() => selectTab('alliance')} />
            <PanelTab label="宝石商店" active={isGem} left={447} top={302} width={200} kind="alliance"
                onClick={() => selectTab('gem')} />

            <image source={imageRef('ui/mail/footer')}
                style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110, sizeMode: 'sliced' }} />
            <view interaction="press" onClick={back}
                style={{ position: 'absolute', left: 13, top: 1396, width: 64, height: 56 }}>
                <image source={imageRef('ui/mail/back')}
                    style={{ position: 'absolute', width: 64, height: 56 }} />
            </view>
            <text visible={showRestock} value={p.restockLabel ?? '每周一补货'}
                style={{ position: 'absolute', left: 300, top: 1389, width: 149, height: 30,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#ffffff', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <image visible={showRestock} source={imageRef('ui/shop/clock')}
                style={{ position: 'absolute', left: 248, top: 1423, width: 35, height: 42 }} />
            <text visible={showRestock} value={p.restockTime ?? '4天17:35:26'}
                style={{ position: 'absolute', left: 289, top: 1433, width: 173, height: 27,
                    font: fontRef('fonts/regular', 700), fontSize: 24, color: '#ffffff', bold: true,
                    verticalAlign: 'center', overflow: 'shrink' }} />
            <view visible={isGem} interaction="press" onClick={() => p.onAction?.('open_emoji')}
                style={{ position: 'absolute', left: 521, top: 1390, width: 59, height: 60 }}>
                <image source={imageRef('ui/alliance/board-emoji')}
                    style={{ width: 59, height: 60 }} />
            </view>
            <view visible={isGem} interaction="press" onClick={() => p.onAction?.('send_message')}
                style={{ position: 'absolute', left: 589, top: 1383, width: 154, height: 77 }}>
                <image source={imageRef('ui/alliance/board-send')}
                    style={{ width: 154, height: 77 }} />
            </view>

            <ShopGetItemPanel visible={buyOpen} name={buyName} description={buyDesc}
                owned={buyOwned} unitPrice={buyPrice} onClose={closeBuy}
                onBuy={(quantity) => {
                    p.onAction?.(`confirm_buy:${buyId}:${quantity}`);
                    closeBuy();
                }} />
        </view>
    );
});
