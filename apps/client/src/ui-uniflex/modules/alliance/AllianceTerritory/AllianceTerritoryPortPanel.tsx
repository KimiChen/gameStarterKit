import { defineComponent, useEffect, useMemo, useRef, VirtualList } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { cancelButton, confirmButton } from '../../../components/button/buttonSkins';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { AllianceTerritoryPortRow, PORT_ROW_SIZE } from './AllianceTerritoryPortRow';

export interface AllianceTerritoryPortEffect {
    readonly id: string;
    readonly stripe: boolean;
    readonly label: string;
    readonly value: string;
}

export interface AllianceTerritoryPortPanelProps {
    readonly visible?: boolean;
    readonly effects?: readonly AllianceTerritoryPortEffect[];
    readonly onAction?: (id: string) => void;
}

const defaultEffects: readonly AllianceTerritoryPortEffect[] = [
    { id: 'p0', stripe: true, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p1', stripe: false, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p2', stripe: true, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p3', stripe: false, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p4', stripe: true, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p5', stripe: false, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p6', stripe: true, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p7', stripe: false, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p8', stripe: true, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p9', stripe: false, label: '联盟资金产量+0/h', value: '10K/10M' },
    { id: 'p10', stripe: true, label: '联盟资金产量+0/h', value: '10K/10M' },
];

export const AllianceTerritoryPortPanel = defineComponent<AllianceTerritoryPortPanelProps>((p) => {
    const effects = p.effects ?? defaultEffects;
    const source = useMemo(() => new ArrayVirtualListDataSource(effects), [effects]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    return (
        <view name="AllianceTerritoryPort" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
            <image source={imageRef('ui/alliance/flag-banner-port')}
                style={{ position: 'absolute', left: 14, top: 332, width: 723, height: 200 }} />
            <image source={imageRef('ui/alliance/flag-list-bg')}
                style={{ position: 'absolute', left: 15, top: 544, width: 719, height: 706, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/flag-section-header')}
                style={{ position: 'absolute', left: 15, top: 543, width: 719, height: 64 }} />
            <text value="港口占领效果"
                style={{ position: 'absolute', left: 32, top: 543, width: 500, height: 64,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#ffffff', bold: true, verticalAlign: 'center' }} />
            <VirtualList source={source} key="id" direction="vertical" itemSize={PORT_ROW_SIZE} gap={0}
                overscan={2} controller={list} inertia elastic
                style={{ position: 'absolute', left: 15, top: 608, width: 719, height: 642 }}>
                {(item) => <AllianceTerritoryPortRow stripe={item.stripe} label={item.label} value={item.value} />}
            </VirtualList>
            <view style={{ position: 'absolute', left: 77, top: 1262, width: 255, height: 102 }}>
                <ActionButton skin={confirmButton} label="港口列表" onClick={() => p.onAction?.('open_port_list')} />
            </view>
            <view style={{ position: 'absolute', left: 419, top: 1262, width: 255, height: 102 }}>
                <ActionButton skin={cancelButton} label="取消" onClick={() => p.onAction?.('cancel')} />
            </view>
        </view>
    );
});
