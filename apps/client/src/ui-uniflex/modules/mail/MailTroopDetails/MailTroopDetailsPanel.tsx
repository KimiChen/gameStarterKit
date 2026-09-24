import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { TroopComparisonRow } from './TroopComparisonRow';
import type { TroopBonusGroup, TroopComparisonItem } from './troopDetailsTypes';

export interface MailTroopDetailsPanelProps {
    readonly visible?: boolean;
    readonly groups?: readonly TroopBonusGroup[];
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
}

// The reference intentionally has two separately expandable rows named 部队负重.
const exampleGroups: readonly TroopBonusGroup[] = [
    { id: 'gather-speed', label: '资源采集速度', own: '16.22%', enemy: '0%', initiallyExpanded: true,
        details: [{ id: 'ship-tech', label: '船只科技', own: '16.22%', enemy: '0%' }] },
    { id: 'load-1', label: '部队负重', own: '16.22%', enemy: '0%', initiallyExpanded: true,
        details: [{ id: 'ship-tech', label: '船只科技', own: '16.22%', enemy: '0%' }] },
    { id: 'load-2', label: '部队负重', own: '16.22%', enemy: '0%', initiallyExpanded: false,
        details: [{ id: 'ship-tech', label: '船只科技', own: '16.22%', enemy: '0%' }] },
];
const windowImage = imageRef('ui/mail-report-detail/window');
const closeImage = imageRef('ui/mail-battle-log/close');

/** Headers and bonus sources share one flattened virtual list. */
function comparisonRows(groups: readonly TroopBonusGroup[], expanded: Readonly<Record<string, boolean>>): TroopComparisonItem[] {
    const rows: TroopComparisonItem[] = [];
    for (const group of groups) {
        const open = expanded[group.id] ?? group.initiallyExpanded === true;
        rows.push({ id: `group:${group.id}`, groupId: group.id, label: group.label, own: group.own, enemy: group.enemy,
            header: true, expanded: open, expandable: group.details.length > 0, height: 62 });
        if (open) {
            for (const detail of group.details) {
                rows.push({ ...detail, id: `source:${group.id}:${detail.id}`, groupId: group.id,
                    header: false, expanded: false, expandable: false, height: 60 });
            }
        }
    }
    return rows;
}

export const MailTroopDetailsPanel = defineComponent<MailTroopDetailsPanelProps>((p) => {
    const groups = p.groups ?? exampleGroups;
    const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});
    const rows = useMemo(() => comparisonRows(groups, expanded), [groups, expanded]);
    const source = useMemo(() => new ArrayVirtualListDataSource(rows), [rows]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => {
        if (p.visible !== false) {
            setExpanded({});
            list.current?.scrollToIndex(0, 'start', 0);
        }
    }, [p.visible]);
    const toggle = (item: TroopComparisonItem) => {
        if (!item.expandable) return;
        setExpanded(current => ({ ...current, [item.groupId]: !item.expanded }));
        p.onAction?.(`${item.expanded ? 'collapse' : 'expand'}:${item.groupId}`);
    };
    return <view name="MailTroopDetailsPanel" visible={p.visible !== false} style={{ position: 'absolute', width: 750, height: 1624 }}>
        <PopupFrame title="部队详情" background={windowImage} closeSource={closeImage}
            left={19} top={221} width={714} height={1186} titleTop={6} titleHeight={58}
            titleOutline="#754C2C" titleOutlineWidth={2} closeRight={3} closeTop={2} closeHit={50} closeIcon={50}
            maskColor="#00000099" onClose={p.onClose} />
        <image source={imageRef('ui/mail-report-detail/panel')} style={{ position: 'absolute', left: 40, top: 303, width: 673, height: 928 }} />
        <image source={imageRef('ui/mail-battle-log/header')} style={{ position: 'absolute', left: 40, top: 303, width: 673, height: 49 }} />
        <text value="我方" style={{ position: 'absolute', left: 64, top: 303, width: 140, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value="增益效果对比" style={{ position: 'absolute', left: 239, top: 303, width: 270, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value="敌方" style={{ position: 'absolute', left: 554, top: 303, width: 110, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <VirtualList source={source} key="id" sizeKey="height" direction="vertical" controller={list} overscan={2} inertia elastic
            style={{ position: 'absolute', left: 50, top: 365, width: 656, height: 851 }}>
            {(item) => <TroopComparisonRow item={item} onToggle={() => toggle(item)} />}
        </VirtualList>
    </view>;
});
