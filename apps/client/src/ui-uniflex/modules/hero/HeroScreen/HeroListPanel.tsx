import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, imageRef, type ImageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { HeroCard, type HeroCardClass, type HeroCardQuality } from './HeroCard';
import { HeroFilterBar, type HeroFilterId } from './HeroFilterBar';

export interface HeroCardItem {
    readonly id: string;
    readonly quality: HeroCardQuality;
    readonly classId: HeroCardClass;
    readonly portrait?: ImageRef;
    readonly owned: boolean;
    readonly level?: string;
    readonly fragments?: string;
    readonly fillWidth?: number;
    readonly stars?: number;
    readonly team?: string;
}

export interface HeroListPanelProps {
    readonly visible?: boolean;
    readonly cards: readonly HeroCardItem[];
    readonly onSelectCard?: (id: string, stars?: number) => void;
    readonly onFilter?: (id: HeroFilterId) => void;
}

export const HeroListPanel = defineComponent<HeroListPanelProps>((p) => {
    const [filter, setFilter] = useState<HeroFilterId>('all');
    const cards = useMemo(() => {
        if (filter === 'all') return p.cards;
        if (filter === 'unowned') {
            const out: HeroCardItem[] = [];
            for (const card of p.cards) if (!card.owned) out.push(card);
            return out;
        }
        const out: HeroCardItem[] = [];
        for (const card of p.cards) if (card.classId === filter) out.push(card);
        return out;
    }, [p.cards, filter]);
    const source = useMemo(() => new ArrayVirtualListDataSource(cards), [cards]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    const selectFilter = (id: HeroFilterId) => {
        setFilter(id);
        p.onFilter?.(id);
    };
    return (
        <view name="HeroListPanel" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }}>
            <image source={imageRef('ui/hero/list-panel')}
                style={{ position: 'absolute', left: 15, top: 157, width: 720, height: 948, sizeMode: 'sliced' }} />
            <VirtualList source={source} key="id" layout="grid" lanes={4}
                direction="vertical" itemSize={248} gap={12} crossGap={5} overscan={1}
                controller={list} inertia elastic
                style={{ position: 'absolute', left: 25, top: 169, width: 696, height: 923 }}>
                {(item) => <HeroCard quality={item.quality} classId={item.classId} portrait={item.portrait} owned={item.owned}
                    level={item.level} fragments={item.fragments} fillWidth={item.fillWidth}
                    stars={item.stars} team={item.team} onClick={() => p.onSelectCard?.(item.id, item.stars ?? 0)} />}
            </VirtualList>
            <HeroFilterBar selected={filter} onSelect={selectFilter} />
        </view>
    );
});
