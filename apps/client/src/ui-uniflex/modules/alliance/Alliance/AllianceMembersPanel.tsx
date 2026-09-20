import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { AllianceRankGroup, HEADER_HEIGHT, ROW_STEP, type AllianceRankMember } from './AllianceRankGroup';

export interface AllianceMembersPanelProps {
    readonly visible?: boolean;
    readonly power?: string;
    readonly slots?: readonly string[];
    readonly r5?: readonly AllianceRankMember[];
    readonly r4?: readonly AllianceRankMember[];
    readonly r3?: readonly AllianceRankMember[];
    readonly onAction?: (id: string) => void;
}

type RankId = 'r5' | 'r4' | 'r3';

interface AllianceRankListItem {
    readonly id: string;
    readonly height: number;
    readonly isHeader: boolean;
    readonly groupId: RankId;
    readonly rank: string;
    readonly rankColor: string;
    readonly count: string;
    readonly expanded: boolean;
    readonly power: string;
    readonly combat: string;
    readonly status: string;
    readonly online: boolean;
}

const defaultR5: readonly AllianceRankMember[] = [
    { id: 'r5-0', power: '5000', combat: '5000', status: '[1天之前]', online: false },
];
const defaultR4: readonly AllianceRankMember[] = [
    { id: 'r4-0', power: '5000', combat: '5000', status: '在线', online: true },
    { id: 'r4-1', power: '352', combat: '9999', status: '[1天之前]', online: false },
    { id: 'r4-2', power: '1280', combat: '760', status: '在线', online: true },
];
const defaultR3: readonly AllianceRankMember[] = [
    { id: 'r3-0', power: '5000', combat: '5000', status: '[1天之前]', online: false },
    { id: 'r3-1', power: '352', combat: '5000', status: '[1天之前]', online: false },
    { id: 'r3-2', power: '880', combat: '2100', status: '在线', online: true },
    { id: 'r3-3', power: '210', combat: '430', status: '[1天之前]', online: false },
];

function rankItems(
    groupId: RankId,
    rank: string,
    rankColor: string,
    members: readonly AllianceRankMember[],
    expanded: boolean,
): AllianceRankListItem[] {
    const count = `(${members.length})`;
    const items: AllianceRankListItem[] = [{
        id: `h-${groupId}`,
        height: HEADER_HEIGHT,
        isHeader: true,
        groupId,
        rank,
        rankColor,
        count,
        expanded,
        power: '',
        combat: '',
        status: '',
        online: false,
    }];
    if (!expanded) return items;
    for (const member of members) {
        items.push({
            id: member.id,
            height: ROW_STEP,
            isHeader: false,
            groupId,
            rank,
            rankColor,
            count,
            expanded,
            power: member.power ?? '5000',
            combat: member.combat ?? '5000',
            status: member.status ?? '在线',
            online: member.online === true,
        });
    }
    return items;
}

export const AllianceMembersPanel = defineComponent<AllianceMembersPanelProps>((p) => {
    const [openR5, setOpenR5] = useState(true);
    const [openR4, setOpenR4] = useState(true);
    const [openR3, setOpenR3] = useState(true);
    const slots = p.slots ?? ['炮手', '先锋', '队长', '枪手'];
    const r5 = p.r5 ?? defaultR5;
    const r4 = p.r4 ?? defaultR4;
    const r3 = p.r3 ?? defaultR3;
    const items = useMemo((): readonly AllianceRankListItem[] => [
        ...rankItems('r5', 'R5', '#EF4B4B', r5, openR5),
        ...rankItems('r4', 'R4', '#CD7443', r4, openR4),
        ...rankItems('r3', 'R3', '#A558C1', r3, openR3),
    ], [r5, r4, r3, openR5, openR4, openR3]);
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    const toggle = (id: RankId) => {
        if (id === 'r5') setOpenR5(!openR5);
        else if (id === 'r4') setOpenR4(!openR4);
        else setOpenR3(!openR3);
    };
    return (
        <view name="AllianceMembers" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, bottom: 0 }}>
            <view interaction="press" onClick={() => p.onAction?.('open_member_notice')}
                style={{ position: 'absolute', left: 687, top: 329, width: 50, height: 50 }}>
                <image source={imageRef('ui/alliance/alert')} style={{ width: 50, height: 50 }} />
            </view>
            <image source={imageRef('ui/alliance/leader-avatar')}
                style={{ position: 'absolute', left: 308, top: 359, width: 134, height: 137 }} />
            <text value="盟主"
                style={{ position: 'absolute', left: 347, top: 468, width: 55, height: 26,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <image source={imageRef('ui/alliance/power-bar')}
                style={{ position: 'absolute', left: 254, top: 502, width: 242, height: 48, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/power-medal')}
                style={{ position: 'absolute', left: 250, top: 503, width: 37, height: 47 }} />
            <text value={p.power ?? '50000'}
                style={{ position: 'absolute', left: 292, top: 508, width: 180, height: 36,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view interaction="press" onClick={() => p.onAction?.('slot_0')}
                style={{ position: 'absolute', left: 95, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[0] ?? '炮手'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => p.onAction?.('slot_1')}
                style={{ position: 'absolute', left: 246, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[1] ?? '先锋'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => p.onAction?.('slot_2')}
                style={{ position: 'absolute', left: 397, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[2] ?? '队长'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => p.onAction?.('slot_3')}
                style={{ position: 'absolute', left: 548, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[3] ?? '枪手'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <image source={imageRef('ui/alliance/list-panel')}
                style={{ position: 'absolute', left: 24, top: 725, width: 703, bottom: 125, sizeMode: 'sliced' }} />
            <VirtualList source={source} key="id" direction="vertical" sizeKey="height"
                estimatedItemSize={ROW_STEP} gap={2} overscan={2} controller={list} inertia elastic
                initialRender={false}
                style={{ position: 'absolute', left: 24, top: 732, width: 703, bottom: 125 }}>
                {(item) => <AllianceRankGroup height={item.height} isHeader={item.isHeader}
                    rank={item.rank} rankColor={item.rankColor} count={item.count} expanded={item.expanded}
                    power={item.power} combat={item.combat} status={item.status} online={item.online}
                    onToggle={() => toggle(item.groupId)} />}
            </VirtualList>
        </view>
    );
});
