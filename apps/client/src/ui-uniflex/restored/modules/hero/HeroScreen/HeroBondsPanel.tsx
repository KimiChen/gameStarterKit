import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../../kits/uniflex/api/core/index';
import { HeroBondItem } from './HeroBondItem';
import { HeroRequiredHero } from './HeroRequiredHero';
import type { HeroCardQuality } from './HeroCard';

export interface HeroBond {
    readonly id: string;
    readonly name: string;
    readonly bonus: string;
}

export interface HeroBondMember {
    readonly id: string;
    readonly quality: HeroCardQuality;
    readonly owned: boolean;
    readonly level: string;
    readonly name: string;
    readonly nameColor: string;
}

export interface HeroBondsPanelProps {
    readonly visible?: boolean;
    readonly bonds: readonly HeroBond[];
    readonly members: readonly HeroBondMember[];
    readonly onSelectBond?: (id: string) => void;
    readonly onBondDetail?: (id: string) => void;
    readonly onSelectMember?: (id: string) => void;
}

export const HeroBondsPanel = defineComponent<HeroBondsPanelProps>((p) => {
    const source = useMemo(() => new ArrayVirtualListDataSource(p.bonds), [p.bonds]);
    const memberSource = useMemo(() => new ArrayVirtualListDataSource(p.members), [p.members]);
    const list = useRef<VirtualCollectionController | null>(null);
    const memberList = useRef<VirtualCollectionController | null>(null);
    const start = p.bonds.length > 1 ? p.bonds[1] : p.bonds[0];
    const [centerId, setCenterId] = useState(start ? start.id : '');
    const [bonus, setBonus] = useState(start ? start.bonus : '');
    const centerRef = useRef(centerId);
    centerRef.current = centerId;
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => () => memberSource.dispose(), [memberSource]);
    useEffect(() => {
        list.current?.scrollToIndex(p.bonds.length > 1 ? 1 : 0, 'center', 0);
    }, [source, p.bonds.length]);
    useEffect(() => {
        let lastIndex = -1;
        let stable = 0;
        let snapped = false;
        const timer = setInterval(() => {
            const controller = list.current;
            if (!controller) return;
            const range = controller.getVisibleRange();
            const index = Math.round((range.firstVisible + range.lastVisible) / 2);
            const bond = p.bonds[index];
            if (!bond) return;
            if (index !== lastIndex) {
                lastIndex = index;
                stable = 0;
                snapped = false;
                return;
            }
            stable += 1;
            if (snapped || stable < 6) return;
            snapped = true;
            if (bond.id !== centerRef.current) {
                setCenterId(bond.id);
                setBonus(bond.bonus);
            }
            controller.scrollToIndex(index, 'center', 220);
        }, 100);
        return () => clearInterval(timer);
    }, [p.bonds, source]);
    return (
        <view name="HeroBondsPanel" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 90, width: 750, height: 1032 }}>
            <VirtualList source={source} key="id" direction="horizontal" itemSize={281} gap={24}
                overscan={2} controller={list} inertia elastic
                style={{ position: 'absolute', left: 0, top: 61, width: 750, height: 360 }}>
                {(item) => <HeroBondItem name={item.name} lit={item.id === centerId}
                    onClick={() => {
                        let index = 0;
                        for (let i = 0; i < p.bonds.length; i++) if (p.bonds[i].id === item.id) index = i;
                        setCenterId(item.id);
                        setBonus(item.bonus);
                        list.current?.scrollToIndex(index, 'center', 180);
                        p.onSelectBond?.(item.id);
                    }} />}
            </VirtualList>
            <view interaction="press" onClick={() => p.onBondDetail?.(centerId)}
                style={{ position: 'absolute', left: 645, top: 21, width: 76, height: 96 }}>
                <image source={imageRef('ui/hero/bond-detail')} style={{ width: 76, height: 76 }} />
                <text value="详情" style={{ position: 'absolute', left: 0, top: 70, width: 76, height: 24,
                    font: fontRef('fonts/regular', 700), fontSize: 20, color: '#ffffff', bold: true, horizontalAlign: 'center' }} />
            </view>
            <image source={imageRef('ui/hero/bond-info')}
                style={{ position: 'absolute', left: 49, top: 478, width: 652, height: 115, sizeMode: 'sliced' }} />
            <text value={bonus}
                style={{ position: 'absolute', left: 49, top: 508, width: 652, height: 40,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#F9CD4A', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <image source={imageRef('ui/hero/bond-panel')}
                style={{ position: 'absolute', left: 0, top: 618, width: 750, height: 517, sizeMode: 'sliced' }} />
            <text value="收集下列英雄即可激活羁绊"
                style={{ position: 'absolute', left: 80, top: 643, width: 590, height: 36,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#584871', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <VirtualList source={memberSource} key="id" layout="grid" lanes={4}
                direction="vertical" itemSize={196} gap={20} crossGap={28} overscan={1}
                controller={memberList} inertia elastic
                style={{ position: 'absolute', left: 21, top: 701, width: 716, height: 321 }}>
                {(item) => <HeroRequiredHero quality={item.quality} owned={item.owned}
                    level={item.level} name={item.name} nameColor={item.nameColor}
                    onClick={() => p.onSelectMember?.(item.id)} />}
            </VirtualList>
        </view>
    );
});
