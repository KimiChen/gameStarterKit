import { defineComponent } from '@uniflex/compiler';
import { imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export type ItemQuality = 'green' | 'blue' | 'purple' | 'orange' | 'red';

export type ItemConfigQuality = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ItemConfigIcon = 'egg' | 'meat' | 'book' | 'scroll' | 'gem' | 'armor';

/** Client projection of the item.json5 contract. Keep item art IDs in this single table. */
export interface ItemConfig {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly icon: ItemConfigIcon;
    readonly quality: ItemConfigQuality;
}

const ITEM_CONFIG: Readonly<Record<string, ItemConfig>> = {
    cube: { id: 'cube', name: '秘能立方', description: '蕴含稳定魔力的合成核心。', icon: 'book', quality: 5 },
    axe: { id: 'axe', name: '霜风战斧', description: '可用于强化英雄装备。', icon: 'scroll', quality: 4 },
    crate: { id: 'crate', name: '联盟补给箱', description: '每周联盟商店可兑换的物资。', icon: 'book', quality: 5 },
    helm: { id: 'helm', name: '勇士盔', description: '可用于强化英雄装备。', icon: 'meat', quality: 5 },
    'book-blue': { id: 'book-blue', name: '秘典', description: '提升英雄技能的读物。', icon: 'book', quality: 3 },
    'book-orange': { id: 'book-orange', name: '秘典', description: '提升英雄技能的读物。', icon: 'book', quality: 5 },
    'scroll-red': { id: 'scroll-red', name: '卷轴', description: '联盟科技所需的研究卷轴。', icon: 'scroll', quality: 6 },
    'equipment-hammer': { id: 'equipment-hammer', name: '锻造锤', description: '', icon: 'scroll', quality: 5 },
    'equipment-core': { id: 'equipment-core', name: '秘银核心', description: '', icon: 'book', quality: 4 },
    'equipment-crystal': { id: 'equipment-crystal', name: '龙晶碎片', description: '', icon: 'gem', quality: 6 },
    'resource-diamond-1': { id: 'resource-diamond-1', name: '强化扳手', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-2': { id: 'resource-diamond-2', name: '精炼晶石', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-3': { id: 'resource-diamond-3', name: '联盟勋章', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-4': { id: 'resource-diamond-4', name: '建筑图纸', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-5': { id: 'resource-diamond-5', name: '秘境粉尘', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-6': { id: 'resource-diamond-6', name: '星辉矿石', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-7': { id: 'resource-diamond-7', name: '远古齿轮', description: '', icon: 'gem', quality: 2 },
    'resource-diamond-8': { id: 'resource-diamond-8', name: '英雄徽记', description: '', icon: 'gem', quality: 2 },
    'speedup-build': { id: 'speedup-build', name: '建筑加速', description: '', icon: 'scroll', quality: 3 },
    'speedup-research': { id: 'speedup-research', name: '研究加速', description: '', icon: 'scroll', quality: 3 },
    'speedup-train': { id: 'speedup-train', name: '训练加速', description: '', icon: 'scroll', quality: 4 },
    'speedup-heal': { id: 'speedup-heal', name: '治疗加速', description: '', icon: 'scroll', quality: 2 },
    'boost-attack': { id: 'boost-attack', name: '攻击增益', description: '', icon: 'gem', quality: 6 },
    'boost-defense': { id: 'boost-defense', name: '防御增益', description: '', icon: 'gem', quality: 5 },
    'boost-gather': { id: 'boost-gather', name: '采集增益', description: '', icon: 'gem', quality: 4 },
    'boost-shield': { id: 'boost-shield', name: '和平护盾', description: '', icon: 'gem', quality: 3 },
    'boost-energy': { id: 'boost-energy', name: '体力药剂', description: '', icon: 'gem', quality: 2 },
    egg: { id: 'egg', name: '火蛋', description: '可在商店兑换的稀有孵化材料。', icon: 'egg', quality: 6 },
    meat: { id: 'meat', name: '烤肉', description: '联盟补给用的食材。', icon: 'meat', quality: 5 },
    book: { id: 'book', name: '秘典', description: '提升英雄技能的读物。', icon: 'book', quality: 4 },
    scroll: { id: 'scroll', name: '卷轴', description: '联盟科技所需的研究卷轴。', icon: 'scroll', quality: 4 },
    gem: { id: 'gem', name: '高级钻石', description: '可以购买好多东西', icon: 'gem', quality: 3 },
    armor: { id: 'armor', name: '盔甲', description: '可用于强化英雄装备。', icon: 'armor', quality: 5 },
};

export function getItemConfig(itemId: string): ItemConfig {
    const item = ITEM_CONFIG[itemId];
    if (!item) throw new Error(`Unknown item id: ${itemId}`);
    return item;
}

export function itemQuality(itemId: string): ItemQuality {
    switch (getItemConfig(itemId).quality) {
        case 2: return 'green';
        case 3: return 'blue';
        case 4: return 'purple';
        case 5: return 'orange';
        case 6: return 'red';
        default: throw new Error(`Missing quality artwork for item: ${itemId}`);
    }
}

const ITEM_ICONS: Readonly<Record<ItemConfigIcon, ImageRef>> = {
    egg: imageRef('ui/shop/item-egg'),
    meat: imageRef('ui/shop/item-meat'),
    book: imageRef('ui/shop/item-book'),
    scroll: imageRef('ui/shop/item-scroll'),
    gem: imageRef('ui/shop/getitem-icon'),
    armor: imageRef('ui/reward/icon-armor'),
};

const DETAIL_BG = imageRef('ui/backpack/detail-count-bg');

/** Item artwork follows the item contract, not the UI theme. */
export function itemIcon(itemId: string) {
    return ITEM_ICONS[getItemConfig(itemId).icon];
}

export interface ItemSlotProps {
    readonly theme?: ComponentTheme;
    readonly left: number;
    readonly top: number;
    readonly itemId: string;
    readonly count?: string;
    readonly countColor?: string;
    readonly countOutline?: string;
    /** Centered plate over the icon. Hidden when empty. */
    readonly detailCount?: string;
    readonly frames?: Readonly<Record<ItemQuality, ImageRef>>;
}

/** Shared 154×159 item frame (backpack / shop / hero bond). Icon, count, and detail plate are optional. */
export const ItemSlot = defineComponent<ItemSlotProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const left = p.left;
    const top = p.top;
    const quality = itemQuality(p.itemId);
    const frames = p.frames ?? theme.item.frames;
    const frame = frames[quality];
    const count = p.count ?? '';
    const showCount = count !== '';
    const showIcon = true;
    const icon = itemIcon(p.itemId);
    const width = p.theme?.item.width ?? activeTheme.item.width;
    const height = p.theme?.item.height ?? activeTheme.item.height;
    const iconLeft = p.theme?.item.iconLeft ?? activeTheme.item.iconLeft;
    const iconTop = p.theme?.item.iconTop ?? activeTheme.item.iconTop;
    const iconWidth = p.theme?.item.iconWidth ?? activeTheme.item.iconWidth;
    const iconHeight = p.theme?.item.iconHeight ?? activeTheme.item.iconHeight;
    const countLeft = p.theme?.item.countLeft ?? activeTheme.item.countLeft;
    const countTop = p.theme?.item.countTop ?? activeTheme.item.countTop;
    const countWidth = p.theme?.item.countWidth ?? activeTheme.item.countWidth;
    const countHeight = p.theme?.item.countHeight ?? activeTheme.item.countHeight;
    const countSize = p.theme?.item.countSize ?? activeTheme.item.countSize;
    const countAlign = p.theme?.item.countAlign ?? activeTheme.item.countAlign;
    const countColor = p.countColor ?? theme.item.color;
    const countOutline = p.countOutline ?? theme.item.outline;
    const outlineWidth = p.theme?.item.outlineWidth ?? activeTheme.item.outlineWidth;
    const font = theme.item.font;
    const detail = p.detailCount ?? '';
    const showDetail = detail !== '';
    const detailColor = theme.item.color;
    const detailOutline = theme.item.outline;
    return (
        <view name="ItemSlot" style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image name="ItemSlot/Frame" source={frame}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, sizeMode: 'sliced' }} />
            <image name="ItemSlot/Icon" visible={showIcon} source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <text name="ItemSlot/Count" visible={showCount} value={count}
                style={{ position: 'absolute', left: countLeft, top: countTop, width: countWidth, height: countHeight,
                    font: font, fontSize: countSize, color: countColor, bold: true,
                    outlineColor: countOutline, outlineWidth: outlineWidth,
                    horizontalAlign: countAlign, verticalAlign: 'center', overflow: 'shrink' }} />
            <image name="ItemSlot/DetailBg" visible={showDetail} source={DETAIL_BG}
                style={{ position: 'absolute', left: 8, top: 8, width: 138, height: 40, sizeMode: 'sliced' }} />
            <text name="ItemSlot/Detail" visible={showDetail} value={detail}
                style={{ position: 'absolute', left: 8, top: 8, width: 138, height: 40,
                    font: font, fontSize: 32, color: detailColor, bold: true,
                    outlineColor: detailOutline, outlineWidth: outlineWidth,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
