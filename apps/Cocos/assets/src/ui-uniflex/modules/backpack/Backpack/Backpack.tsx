import { defineView, useEffect, useMemo, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { BackpackItemCard, type BackpackItem, type BackpackQuality } from './components/BackpackItemCard';
import { BackpackQuantityControl } from './components/BackpackQuantityControl';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { EmptyState } from '../../../gamecomponents/empty/EmptyState';
import { ResourceCounter } from '../../../gamecomponents/resource/ResourceCounter';
import { TabBar } from '../../../components/tab/TabBar';
import { mailTab } from '../../../components/tab/tabSkins';

export type BackpackAction = {
    readonly id: string;
    readonly action: 'back' | 'close' | 'tab' | 'primary' | 'select';
    readonly value?: string | number;
};
export interface BackpackTabData {
    readonly id: string;
    readonly label: string;
    readonly items: readonly BackpackItem[];
}
export type BackpackTabs = readonly [BackpackTabData, BackpackTabData, BackpackTabData, BackpackTabData, BackpackTabData];
export interface BackpackParams {
    readonly title?: string;
    readonly tabs?: BackpackTabs;
    readonly resources?: readonly [string, string, string, string];
    readonly onAction?: (action: BackpackAction) => void;
}

const item = (
    slot: number,
    id: string,
    name: string,
    description: string,
    quality: BackpackQuality,
    count: number,
    maxUseCount: number,
): BackpackItem => ({ id, slot, name, description, quality, count, detailCount: count * 5, maxUseCount });

const defaultTabs: BackpackTabs = [
    { id: 'equipment', label: '装备', items: [
        item(0, 'equipment-hammer', '锻造锤', '用于装备锻造，可显著提升锻造成功率。', 'orange', 6, 3),
        item(1, 'equipment-core', '秘银核心', '稀有装备突破材料，蕴含稳定的魔力。', 'purple', 18, 5),
        item(2, 'equipment-crystal', '龙晶碎片', '传说装备升阶所需的珍贵结晶。', 'red', 2, 1),
    ] },
    { id: 'resource', label: '资源', items: [
        item(0, 'resource-diamond-1', '强化扳手', '有效的提高陷阱等级，增加联盟成员对【巨蛇】造成的伤害。', 'green', 99, 1),
        item(1, 'resource-diamond-2', '精炼晶石', '用于精炼装备属性，提升基础战斗能力。', 'green', 64, 5),
        item(2, 'resource-diamond-3', '联盟勋章', '可在联盟商店兑换稀有道具。', 'green', 37, 5),
        item(3, 'resource-diamond-4', '建筑图纸', '升级高级建筑时使用的通用材料。', 'green', 82, 5),
        item(4, 'resource-diamond-5', '秘境粉尘', '蕴含微弱魔力的基础合成材料。', 'green', 48, 5),
        item(5, 'resource-diamond-6', '星辉矿石', '来自深层矿脉的稀有强化材料。', 'green', 23, 3),
        item(6, 'resource-diamond-7', '远古齿轮', '修复遗迹机关所需的精密零件。', 'green', 16, 4),
        item(7, 'resource-diamond-8', '英雄徽记', '用于提升英雄星级和技能上限。', 'green', 11, 2),
    ] },
    { id: 'speedup', label: '加速', items: [
        item(0, 'speedup-build', '建筑加速', '立即减少建筑队列 60 分钟。', 'blue', 12, 5),
        item(1, 'speedup-research', '研究加速', '立即减少科技研究 30 分钟。', 'blue', 27, 5),
        item(2, 'speedup-train', '训练加速', '立即减少部队训练 15 分钟。', 'purple', 8, 4),
        item(3, 'speedup-heal', '治疗加速', '立即减少伤兵治疗 10 分钟。', 'green', 45, 5),
    ] },
    { id: 'boost', label: '增益', items: [
        item(0, 'boost-attack', '攻击增益', '部队攻击力提高 10%，持续 8 小时。', 'red', 3, 1),
        item(1, 'boost-defense', '防御增益', '部队防御力提高 10%，持续 8 小时。', 'orange', 5, 2),
        item(2, 'boost-gather', '采集增益', '资源采集速度提高 25%，持续 12 小时。', 'purple', 9, 3),
        item(3, 'boost-shield', '和平护盾', '保护城池免受侦察和攻击，持续 8 小时。', 'blue', 7, 1),
        item(4, 'boost-energy', '体力药剂', '立即恢复 50 点行动体力。', 'green', 21, 5),
    ] },
    { id: 'other', label: '其他', items: [] },
];

export const Backpack = defineView<BackpackParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const tabs = params.tabs ?? defaultTabs;
    const resources = params.resources ?? ['999.99k', '999.99k', '999.99k', '999.99k'];
    const [activeTab, setActiveTab] = useState(1);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(0);
    const items = tabs[activeTab].items;
    const detailItem = useMemo(() => items.find((entry) => entry.id === selectedId) ?? items[0], [items, selectedId]);
    const itemSource = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    useEffect(() => () => itemSource.dispose(), [itemSource]);
    const emit = (id: string, action: BackpackAction['action'], value?: string | number) =>
        params.onAction?.({ id, action, value });
    const selectTab = (index: number) => {
        setActiveTab(index);
        setSelectedId(null);
        setQuantity(0);
        emit(`tab-${tabs[index].id}`, 'tab', tabs[index].id);
    };
    const selectItem = (entry: BackpackItem) => {
        setSelectedId(entry.id);
        setQuantity(1);
        emit(`item-${entry.id}`, 'select', entry.id);
    };
    const setSafeQuantity = (next: number) => {
        if (!detailItem) return;
        const value = Math.max(0, Math.min(detailItem.maxUseCount, Math.round(next)));
        setQuantity(value);
        emit('quantity', 'select', value);
    };
    const hasItems = items.length > 0;
    const emptyIcon = imageRef('ui/backpack/empty');
    const resourceIcon = imageRef('ui/backpack/resource-diamond');
    const headerSource = imageRef('ui/backpack/header');
    const footerSource = imageRef('ui/backpack/footer');
    return (
        <view name="Backpack" style={{ width: 750, height: 1334, backgroundColor: '#F3EFE9' }}>
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 170, backgroundColor: '#553E78' }} />
            <ScreenHeader title={params.title ?? '背包'} titleWidth={118} titleHeight={60} source={headerSource} />
            <ResourceCounter icon={resourceIcon} left={159} top={22} value={resources[0]}
                id="resource-1" onClick={() => emit('resource-1', 'primary')} />
            <ResourceCounter icon={resourceIcon} left={303} top={22} value={resources[1]}
                id="resource-2" onClick={() => emit('resource-2', 'primary')} />
            <ResourceCounter icon={resourceIcon} left={447} top={22} value={resources[2]}
                id="resource-3" onClick={() => emit('resource-3', 'primary')} />
            <ResourceCounter icon={resourceIcon} left={591} top={22} value={resources[3]}
                id="resource-4" onClick={() => emit('resource-4', 'primary')} />

            <TabBar skin={mailTab} left={14} top={118} itemWidth={134} gap={13} width={736} selected={tabs[activeTab].id}
                items={tabs} onSelect={(_id, index) => selectTab(index)} />

            <VirtualList visible={hasItems} name="Backpack/Items" source={itemSource} key="id"
                layout="grid" lanes={4} direction="vertical" itemSize={191} gap={32} crossGap={28}
                overscan={1} inertia elastic
                style={{ position: 'absolute', left: 25, top: 216, width: 700, height: 690 }}>
                {(entry) => <BackpackItemCard item={entry} selected={selectedId === entry.id}
                    onClick={() => selectItem(entry)} />}
            </VirtualList>
            <image source={imageRef('ui/settings/divider')} style={{ position: 'absolute', left: 26, top: 928, width: 698, height: 3, sizeMode: 'sliced' }} />

            <view visible={!hasItems} name="Backpack/Empty" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1225 }}>
                <EmptyState icon={emptyIcon} left={321} top={977} label="背包里没有任何道具"
                    labelLeft={150} labelTop={1117} labelWidth={450} labelHeight={64} />
            </view>

            <view visible={hasItems} name="Backpack/Details" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1225 }}>
                <text value={detailItem?.name ?? ''} style={{ position: 'absolute', left: 23, top: 946, width: 704, height: 48,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#3F3254', bold: true,
                    verticalAlign: 'center', overflow: 'shrink' }} />
                <text value={detailItem?.description ?? ''} style={{ position: 'absolute', left: 23, top: 998, width: 704, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#837A91', bold: true,
                    verticalAlign: 'center', overflow: 'shrink' }} />
                <BackpackQuantityControl value={quantity} max={detailItem?.maxUseCount ?? 1}
                    onDecrease={() => setSafeQuantity(quantity - 1)} onIncrease={() => setSafeQuantity(quantity + 1)}
                    onChange={setSafeQuantity} />
            </view>

            <ScreenFooter source={footerSource} onBack={() => emit('back', 'back')} />
        </view>
    );
});
