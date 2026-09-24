import { defineComponent, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { BattleLogSection } from './BattleLogSection';
import type { BattleLogRound, BattleLogRow, BattleLogTextRun } from './battleLogData';

const ink = '#3F3254';
const ally = '#2D8A32';
const enemy = '#FF4B50';
const damage = '#A2671C';

const summary: readonly BattleLogTextRun[] = [
    { id: 'player', text: 'Player8699', x: 13, y: 8, width: 144, color: ally },
    { id: 'and', text: '和', x: 158, y: 8, width: 28, color: ink },
    { id: 'enemy', text: '堕落海灵', x: 186, y: 8, width: 112, color: enemy },
    { id: 'battle', text: '发生了战斗！', x: 298, y: 8, width: 180, color: ink },
];
const playerLineup: readonly BattleLogTextRun[] = [
    { id: 'player', text: 'Player8699', x: 13, y: 12, width: 144, color: ally },
    { id: 'will', text: '【威尔】等级 15 和', x: 158, y: 12, width: 238, color: ink },
    { id: 'cersei', text: '【瑟西】', x: 398, y: 12, width: 112, color: ally },
    { id: 'level', text: '等级 15', x: 512, y: 12, width: 135, color: ink },
    { id: 'stats', text: '兵力：160 生命值：91983', x: 13, y: 42, width: 600, color: ink },
];
const enemyLineup: readonly BattleLogTextRun[] = [
    { id: 'enemy', text: '堕落海灵', x: 13, y: 12, width: 112, color: enemy },
    { id: 'bellamy', text: '【贝拉米】', x: 125, y: 12, width: 140, color: enemy },
    { id: 'level-a', text: '等级 2 和', x: 265, y: 12, width: 126, color: ink },
    { id: 'diana', text: '【戴安娜】', x: 391, y: 12, width: 140, color: enemy },
    { id: 'level-b', text: '等级 2', x: 531, y: 12, width: 120, color: ink },
    { id: 'and', text: '和', x: 13, y: 42, width: 28, color: ink },
    { id: 'branger', text: '【布兰杰】', x: 41, y: 42, width: 140, color: enemy },
    { id: 'stats', text: '等级 2 兵力：40 生命值：17436', x: 181, y: 42, width: 470, color: ink },
];

/** Colored runs retain the reference's explicit line breaks; no rich-text parser or nested list. */
const exampleEvents: readonly BattleLogTextRun[] = [
    { id: 'a-dot', text: '·', x: 14, y: 0, width: 26, color: ink },
    { id: 'a-actor', text: '【威尔】', x: 41, y: 0, width: 104, color: ally },
    { id: 'a-to', text: '对', x: 145, y: 0, width: 40, color: ink },
    { id: 'a-target', text: '【贝拉米】', x: 185, y: 0, width: 130, color: enemy },
    { id: 'a-action', text: '发动了普通攻击，', x: 315, y: 0, width: 208, color: ink },
    { id: 'a-subject', text: '【贝拉米】', x: 523, y: 0, width: 130, color: enemy },
    { id: 'a-lost', text: '损失了', x: 13, y: 30, width: 82, color: ink },
    { id: 'a-number', text: '2854', x: 95, y: 30, width: 64, color: damage },
    { id: 'a-unit', text: '点生命值！', x: 160, y: 30, width: 180, color: ink },
    { id: 'b-dot', text: '·', x: 14, y: 60, width: 26, color: ink },
    { id: 'b-actor', text: '【贝拉米】', x: 41, y: 60, width: 130, color: enemy },
    { id: 'b-action', text: '发动了反击，', x: 175, y: 60, width: 182, color: ink },
    { id: 'b-target', text: '【威尔】', x: 359, y: 60, width: 104, color: ally },
    { id: 'b-lost', text: '损失了', x: 465, y: 60, width: 78, color: ink },
    { id: 'b-number', text: '111', x: 545, y: 60, width: 52, color: damage },
    { id: 'b-unit', text: '点生', x: 598, y: 60, width: 54, color: ink },
    { id: 'b-end', text: '命值！', x: 13, y: 90, width: 90, color: ink },
    { id: 'c-dot', text: '·', x: 14, y: 120, width: 26, color: ink },
    { id: 'c-actor', text: '【贝拉米】', x: 41, y: 120, width: 130, color: enemy },
    { id: 'c-to', text: '对', x: 175, y: 120, width: 40, color: ink },
    { id: 'c-target', text: '【威尔】', x: 215, y: 120, width: 104, color: ally },
    { id: 'c-action', text: '发动了普通攻击，', x: 320, y: 120, width: 208, color: ink },
    { id: 'c-subject', text: '【威尔】', x: 530, y: 120, width: 110, color: ally },
    { id: 'c-lost', text: '损失了', x: 13, y: 150, width: 82, color: ink },
    { id: 'c-number', text: '111', x: 95, y: 150, width: 48, color: damage },
    { id: 'c-unit', text: '点生命值！', x: 144, y: 150, width: 180, color: ink },
    { id: 'd-dot', text: '·', x: 14, y: 180, width: 26, color: ink },
    { id: 'd-actor', text: '【威尔】', x: 41, y: 180, width: 104, color: ally },
    { id: 'd-action', text: '发动了反击，', x: 147, y: 180, width: 182, color: ink },
    { id: 'd-target', text: '【贝拉米】', x: 331, y: 180, width: 130, color: enemy },
    { id: 'd-lost', text: '损失了', x: 463, y: 180, width: 78, color: ink },
    { id: 'd-number', text: '2854', x: 541, y: 180, width: 64, color: damage },
    { id: 'd-unit', text: '点生', x: 605, y: 180, width: 54, color: ink },
    { id: 'd-end', text: '命值！', x: 13, y: 210, width: 90, color: ink },
];

export const exampleBattleLogRounds: readonly BattleLogRound[] = [{
    id: '1', number: 1, playerHp: '91,760', enemyHp: '91,760', playerLoss: '-223', enemyLoss: '-223',
    events: exampleEvents, eventHeight: 240,
}];

export function battleLogRows(rounds: readonly BattleLogRound[], collapsed: Readonly<Record<string, boolean>>): BattleLogRow[] {
    const groups = [
        { id: 'summary', title: '战斗简介', runs: summary, bodyHeight: 86, gap: 11 },
        { id: 'player', title: '我方阵容', runs: playerLineup, bodyHeight: 86, gap: 14 },
        { id: 'enemy', title: '敌方阵容', runs: enemyLineup, bodyHeight: 88, gap: 6 },
    ];
    const rows: BattleLogRow[] = groups.map(group => ({
        ...group, expanded: !collapsed[group.id], height: 52 + (collapsed[group.id] ? 0 : group.bodyHeight) + group.gap, round: null,
    }));
    for (const round of rounds) {
        const id = `round:${round.id}`;
        const bodyHeight = 113 + round.eventHeight;
        rows.push({ id, title: `第 ${round.number} 回合`, expanded: !collapsed[id], height: 54 + (collapsed[id] ? 0 : bodyHeight), bodyHeight, runs: [], round });
    }
    return rows;
}

export function setAllRoundsCollapsed(rounds: readonly BattleLogRound[], current: Readonly<Record<string, boolean>>, collapsed: boolean): Readonly<Record<string, boolean>> {
    const next = { ...current };
    for (const round of rounds) next[`round:${round.id}`] = collapsed;
    return next;
}

export interface MailBattleLogPanelProps {
    readonly visible?: boolean;
    readonly timestamp?: string;
    readonly rounds?: readonly BattleLogRound[];
    readonly onClose?: () => void;
    readonly onAction?: (action: string) => void;
}
const windowImage = imageRef('ui/mail-report-detail/window');
const closeImage = imageRef('ui/mail-battle-log/close');

/** Independent battle log, opened from the comparison report's log link. */
export const MailBattleLogPanel = defineComponent<MailBattleLogPanelProps>((p) => {
    const rounds = p.rounds ?? exampleBattleLogRounds;
    const [collapsed, setCollapsed] = useState<Readonly<Record<string, boolean>>>({});
    const rows = useMemo(() => battleLogRows(rounds, collapsed), [rounds, collapsed]);
    const source = useMemo(() => new ArrayVirtualListDataSource(rows), [rows]);
    const list = useRef<VirtualCollectionController | null>(null);
    const allClosed = rounds.length > 0 && rounds.every(round => collapsed[`round:${round.id}`] === true);
    const chevronRotation = allClosed ? 'rot:180' : 'rot:0';
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => {
        if (p.visible !== false) {
            setCollapsed({});
            list.current?.scrollToIndex(0, 'start', 0);
        }
    }, [p.visible]);
    const toggle = (id: string) => {
        setCollapsed(current => ({ ...current, [id]: !current[id] }));
        p.onAction?.(`toggle:${id}`);
    };
    const toggleRounds = () => {
        setCollapsed(current => setAllRoundsCollapsed(rounds, current, !allClosed));
        p.onAction?.(allClosed ? 'expand-all-rounds' : 'collapse-all-rounds');
    };
    return <view name="MailBattleLogPanel" visible={p.visible !== false} style={{ position: 'absolute', width: 750, height: 1624 }}>
        <PopupFrame title="战斗日志" background={windowImage} closeSource={closeImage}
            left={19} top={221} width={714} height={1186} titleTop={6} titleHeight={58}
            titleOutline="#754C2C" titleOutlineWidth={2} closeRight={9} closeTop={21} closeHit={50} closeIcon={50}
            maskColor="#00000099" onClose={p.onClose} />
        <image source={imageRef('ui/mail-report-detail/panel')} style={{ position: 'absolute', left: 37, top: 303, width: 673, height: 928 }} />
        <image source={imageRef('ui/mail-battle-log/header')} style={{ position: 'absolute', left: 40, top: 303, width: 673, height: 49 }} />
        <text name="BattleLog/Date" value={p.timestamp ?? '2026-9-8 11:24'} style={{ position: 'absolute', left: 51, top: 303, width: 350, height: 49,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#FFFFFF', verticalAlign: 'center' }} />
        <view name="BattleLog/ToggleAllRounds" interaction="press" interactable={rounds.length > 0} onClick={toggleRounds}
            style={{ position: 'absolute', left: 457, top: 303, width: 246, height: 49 }}>
            <text value={allClosed ? '展开所有回合' : '关闭所有回合'} style={{ position: 'absolute', width: 196, height: 49,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 30, color: '#FFFFFF', verticalAlign: 'center' }} />
            <image name={chevronRotation} source={imageRef('ui/mail-battle-log/collapse-all')} style={{ position: 'absolute', left: 211, top: 10, width: 32, height: 31 }} />
        </view>
        <VirtualList source={source} key="id" sizeKey="height" direction="vertical" controller={list} overscan={1} inertia elastic
            style={{ position: 'absolute', left: 47, top: 362, width: 660, height: 854 }}>
            {(row) => <BattleLogSection row={row} onToggle={() => toggle(row.id)} />}
        </VirtualList>
    </view>;
});
