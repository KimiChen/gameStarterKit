import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { SoldierDetailRow } from './SoldierDetailRow';
import type { SoldierDetailGroup, SoldierDetailItem, SoldierDetailEntry, SoldierCasualties } from './soldierDetailsTypes';

export interface MailSoldierDetailsPanelProps {
    readonly visible?: boolean;
    readonly groups?: readonly SoldierDetailGroup[];
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
}
// The source shows report totals independently of the two illustrative soldier rows.
const exampleTotals: SoldierCasualties = { dead: 0, severelyWounded: 999, lightlyWounded: 20, kills: 0, remaining: 0 };
const exampleSoldiers: readonly SoldierDetailEntry[] = [
    { id: 'soldier-1', count: 5432, tier: 1, stats: { dead: 0, severelyWounded: 50, lightlyWounded: 1, kills: 0, remaining: 0 } },
    { id: 'soldier-2', count: 5432, tier: 1, stats: { dead: 0, severelyWounded: 50, lightlyWounded: 1, kills: 0, remaining: 0 } },
];
const exampleGroups: readonly SoldierDetailGroup[] = [
    { id: 'player-1', playerName: '[FTB]玩家名字', side: 'own', stats: exampleTotals, soldiers: exampleSoldiers, initiallyExpanded: true },
    { id: 'enemy-1', playerName: '[CTB]敌方名字', side: 'enemy', stats: exampleTotals, soldiers: exampleSoldiers, initiallyExpanded: true },
    { id: 'player-2', playerName: '[FTB]玩家名字', side: 'own', stats: exampleTotals, soldiers: exampleSoldiers, initiallyExpanded: false },
];
const windowImage = imageRef('ui/mail-report-detail/window');
const closeImage = imageRef('ui/mail-battle-log/close');

function soldierRows(groups: readonly SoldierDetailGroup[], expanded: Readonly<Record<string, boolean>>): SoldierDetailItem[] {
    const rows: SoldierDetailItem[] = [];
    for (const group of groups) {
        const open = expanded[group.id] ?? group.initiallyExpanded === true;
        rows.push({ id: `group:${group.id}`, groupId: group.id, playerName: group.playerName, side: group.side, stats: group.stats,
            count: 0, tier: 0, header: true, expanded: open, expandable: group.soldiers.length > 0, height: 62 });
        if (open) {
            for (const soldier of group.soldiers) {
                rows.push({ ...soldier, id: `soldier:${group.id}:${soldier.id}`, groupId: group.id, playerName: group.playerName, side: group.side,
                    header: false, expanded: false, expandable: false, height: 83 });
            }
        }
    }
    return rows;
}

export const MailSoldierDetailsPanel = defineComponent<MailSoldierDetailsPanelProps>((p) => {
    const groups = p.groups ?? exampleGroups;
    const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});
    const rows = useMemo(() => soldierRows(groups, expanded), [groups, expanded]);
    const source = useMemo(() => new ArrayVirtualListDataSource(rows), [rows]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => {
        if (p.visible !== false) {
            setExpanded({});
            list.current?.scrollToIndex(0, 'start', 0);
        }
    }, [p.visible]);
    const toggle = (item: SoldierDetailItem) => {
        if (!item.expandable) return;
        setExpanded(current => ({ ...current, [item.groupId]: !item.expanded }));
        p.onAction?.(`${item.expanded ? 'collapse' : 'expand'}:${item.groupId}`);
    };
    return <view name="MailSoldierDetailsPanel" visible={p.visible !== false} style={{ position: 'absolute', width: 750, height: 1624 }}>
        <PopupFrame title="士兵详情" background={windowImage} closeSource={closeImage}
            left={19} top={221} width={714} height={1186} titleTop={6} titleHeight={58}
            titleOutline="#754C2C" titleOutlineWidth={2} closeRight={3} closeTop={2} closeHit={50} closeIcon={50}
            maskColor="#00000099" onClose={p.onClose} />
        <image source={imageRef('ui/mail-report-detail/panel')} style={{ position: 'absolute', left: 40, top: 303, width: 673, height: 928 }} />
        <image source={imageRef('ui/mail-battle-log/header')} style={{ position: 'absolute', left: 40, top: 303, width: 673, height: 49 }} />
        <text value="阵亡" style={{ position: 'absolute', left: 285, top: 303, width: 66, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center', wrap: false }} />
        <text value="重伤" style={{ position: 'absolute', left: 360, top: 303, width: 66, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center', wrap: false }} />
        <text value="轻伤" style={{ position: 'absolute', left: 436, top: 303, width: 66, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center', wrap: false }} />
        <text value="击杀" style={{ position: 'absolute', left: 511, top: 303, width: 66, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center', wrap: false }} />
        <text value="剩余" style={{ position: 'absolute', left: 587, top: 303, width: 66, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#FFFFFF', horizontalAlign: 'center', verticalAlign: 'center', wrap: false }} />
        <VirtualList source={source} key="id" sizeKey="height" direction="vertical" controller={list} overscan={2} inertia elastic
            style={{ position: 'absolute', left: 50, top: 365, width: 656, height: 851 }}>
            {(item) => <SoldierDetailRow item={item} onToggle={() => toggle(item)} />}
        </VirtualList>
    </view>;
});
