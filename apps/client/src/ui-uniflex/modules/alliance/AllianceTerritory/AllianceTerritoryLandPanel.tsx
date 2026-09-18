import { defineComponent, useEffect, useMemo, useRef, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { AllianceTerritoryLandCard, LAND_CARD_SIZE } from './AllianceTerritoryLandCard';

export interface AllianceTerritoryLandItem {
    readonly id: string;
    readonly title: string;
    readonly share?: boolean;
    readonly mode: 'peace' | 'build';
    readonly members?: string;
    readonly power?: string;
    readonly peaceText?: string;
    readonly fillWidth?: number;
}

export interface AllianceTerritoryLandPanelProps {
    readonly visible?: boolean;
    readonly items?: readonly AllianceTerritoryLandItem[];
    readonly onAction?: (id: string) => void;
}

const defaultLands: readonly AllianceTerritoryLandItem[] = [
    { id: 'land-0', title: 'Lv. 2 中心城堡', share: true, mode: 'peace' },
    { id: 'land-1', title: 'Lv. 3 中心城堡', mode: 'build' },
];

export const AllianceTerritoryLandPanel = defineComponent<AllianceTerritoryLandPanelProps>((p) => {
    const items = p.items ?? defaultLands;
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    return (
        <view name="AllianceTerritoryLand" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
            <image source={imageRef('ui/alliance/flag-banner-land')}
                style={{ position: 'absolute', left: 14, top: 332, width: 723, height: 200 }} />
            <VirtualList source={source} key="id" direction="vertical" itemSize={LAND_CARD_SIZE} gap={0}
                overscan={2} controller={list} inertia elastic
                style={{ position: 'absolute', left: 0, top: 543, width: 750, height: 826 }}>
                {(item) => <AllianceTerritoryLandCard title={item.title} share={item.share} mode={item.mode}
                    members={item.members} power={item.power} peaceText={item.peaceText} fillWidth={item.fillWidth}
                    onShare={() => p.onAction?.('share_land')}
                    onGarrison={() => p.onAction?.('garrison')}
                    onBuild={() => p.onAction?.('build')} />}
            </VirtualList>
        </view>
    );
});
