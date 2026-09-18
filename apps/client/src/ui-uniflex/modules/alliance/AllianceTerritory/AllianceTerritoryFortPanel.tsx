import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import {
    AllianceTerritoryFortItem,
    FORT_HEADER_H,
    fortCardHeight,
    fortHeaderHeight,
} from './AllianceTerritoryFortItem';

export interface AllianceTerritoryFort {
    readonly id: string;
    readonly name: string;
    readonly subtitle?: string;
    readonly level?: string;
    readonly coord?: string;
    readonly bonus?: string;
}

export interface AllianceTerritoryFortPanelProps {
    readonly visible?: boolean;
    readonly registered?: readonly AllianceTerritoryFort[];
    readonly unregistered?: readonly AllianceTerritoryFort[];
    readonly onAction?: (id: string) => void;
}

interface FortListItem {
    readonly id: string;
    readonly height: number;
    readonly isHeader: boolean;
    readonly groupId: 'reg' | 'unreg';
    readonly headerName: string;
    readonly title: string;
    readonly expanded: boolean;
    readonly subtitle?: string;
    readonly level?: string;
    readonly coord?: string;
    readonly bonus?: string;
}

const defaultUnregistered: readonly AllianceTerritoryFort[] = [
    { id: 'fort-1', name: '一号要塞' },
    { id: 'fort-2', name: '二号要塞' },
];

function sectionItems(
    groupId: 'reg' | 'unreg',
    headerName: string,
    title: string,
    forts: readonly AllianceTerritoryFort[],
    expanded: boolean,
): FortListItem[] {
    const items: FortListItem[] = [{
        id: `h-${groupId}`,
        height: fortHeaderHeight(forts.length, expanded),
        isHeader: true,
        groupId,
        headerName,
        title,
        expanded,
    }];
    if (!expanded) return items;
    const last = forts.length - 1;
    for (let i = 0; i < forts.length; i++) {
        const fort = forts[i];
        items.push({
            id: fort.id,
            height: fortCardHeight(i === last),
            isHeader: false,
            groupId,
            headerName,
            title: fort.name,
            expanded,
            subtitle: fort.subtitle,
            level: fort.level,
            coord: fort.coord,
            bonus: fort.bonus,
        });
    }
    return items;
}

export const AllianceTerritoryFortPanel = defineComponent<AllianceTerritoryFortPanelProps>((p) => {
    const [regOpen, setRegOpen] = useState(true);
    const [unregOpen, setUnregOpen] = useState(true);
    const registered = p.registered ?? [];
    const unregistered = p.unregistered ?? defaultUnregistered;
    const items = useMemo((): readonly FortListItem[] => [
        ...sectionItems('reg', 'AllianceTerritory/Registered', '已报名', registered, regOpen),
        ...sectionItems('unreg', 'AllianceTerritory/Unregistered', '未报名', unregistered, unregOpen),
    ], [registered, unregistered, regOpen, unregOpen]);
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    const toggle = (id: 'reg' | 'unreg') => {
        if (id === 'reg') {
            const next = regOpen !== true;
            setRegOpen(next);
            p.onAction?.(next ? 'expand_registered' : 'collapse_registered');
            return;
        }
        const next = unregOpen !== true;
        setUnregOpen(next);
        p.onAction?.(next ? 'expand_unregistered' : 'collapse_unregistered');
    };
    return (
        <view name="AllianceTerritoryFort" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
            <image source={imageRef('ui/alliance/flag-banner-fort')}
                style={{ position: 'absolute', left: 14, top: 332, width: 723, height: 200 }} />
            <image source={imageRef('ui/alliance/flag-list-bg')}
                style={{ position: 'absolute', left: 15, top: 544, width: 719, height: 776, sizeMode: 'sliced' }} />
            <VirtualList source={source} key="id" direction="vertical" sizeKey="height"
                estimatedItemSize={FORT_HEADER_H} gap={0} overscan={2} controller={list} inertia elastic
                style={{ position: 'absolute', left: 15, top: 539, width: 719, height: 781 }}>
                {(item) => <AllianceTerritoryFortItem height={item.height} isHeader={item.isHeader}
                    headerName={item.headerName} title={item.title} expanded={item.expanded}
                    subtitle={item.subtitle} level={item.level} coord={item.coord} bonus={item.bonus}
                    onToggle={() => toggle(item.groupId)}
                    onGo={() => p.onAction?.(`go_${item.id}`)} />}
            </VirtualList>
        </view>
    );
});
