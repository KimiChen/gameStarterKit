import { defineView, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { TabBar } from '../../../components/tab/TabBar';
import { characterTab } from '../../../components/tab/tabSkins';
import { CharacterPlayerRow } from './CharacterPlayerRow';
import { CharacterServerItem, type CharacterServerStatus } from './CharacterServerItem';

export type CharacterManageTabId = 'mine' | 'recommend' | 'all';

export interface CharacterPlayer {
    readonly id: string;
    readonly name: string;
    readonly level: string;
    readonly server: string;
}

export interface CharacterServer {
    readonly id: string;
    readonly name: string;
    readonly status?: CharacterServerStatus;
}

export interface CharacterManageParams {
    readonly title?: string;
    readonly players?: readonly CharacterPlayer[];
    readonly recommendServers?: readonly CharacterServer[];
    readonly allServers?: readonly CharacterServer[];
    readonly selectedPlayerId?: string;
    readonly onSelectPlayer?: (id: string) => void;
    readonly onSelectServer?: (id: string) => void;
    readonly onClose?: () => void;
}

const tabs: readonly { readonly id: CharacterManageTabId; readonly label: string }[] = [
    { id: 'mine', label: '我的服务器' },
    { id: 'recommend', label: '推荐服务器' },
    { id: 'all', label: '所有服务器' },
];

/** Popup-relative layout from 切图参数.json (content clip_rect / server_list / create_hint). */
const CONTENT = { left: 15, top: 160, width: 678, height: 796 } as const;
const PLAYER_LIST = { left: 41, top: 182, width: 626, itemSize: 130, gap: 18 } as const;
const SERVER_LIST = { left: 38, top: 186, width: 635, itemSize: 74, gap: 23, crossGap: 23 } as const;
const CREATE_HINT = { left: 192, top: 915, width: 324, height: 28 } as const;
const contentBottom = CONTENT.top + CONTENT.height;
const playerListHeight = contentBottom - PLAYER_LIST.top;
const SERVER_VISIBLE_ROWS = 7.5;
const serverListHeight = SERVER_VISIBLE_ROWS * SERVER_LIST.itemSize
    + Math.floor(SERVER_VISIBLE_ROWS) * SERVER_LIST.gap;

const defaultPlayers: readonly CharacterPlayer[] = [
    { id: 'player-1', name: '北境狼王', level: '99', server: 'Voyage1' },
    { id: 'player-2', name: '星海旅人', level: '76', server: '翡翠海' },
    { id: 'player-3', name: '赤焰剑心', level: '54', server: '赤焰要塞' },
    { id: 'player-4', name: '霜月祭司', level: '31', server: '霜月平原' },
    { id: 'player-5', name: '暗影猎手', level: '88', server: '暗影峡谷' },
    { id: 'player-6', name: '初出茅庐', level: '12', server: '新手村' },
];

const defaultRecommendServers: readonly CharacterServer[] = [
    { id: 'rec-voyage', name: 'Voyage1', status: 'green' },
    { id: 'rec-jade', name: '翡翠海', status: 'green' },
    { id: 'rec-flame', name: '赤焰要塞', status: 'yellow' },
    { id: 'rec-frost', name: '霜月平原', status: 'green' },
    { id: 'rec-shadow', name: '暗影峡谷', status: 'yellow' },
    { id: 'rec-dragon', name: '龙骨荒原', status: 'green' },
    { id: 'rec-starfall', name: '星落港', status: 'yellow' },
    { id: 'rec-sky', name: '苍穹城', status: 'green' },
];

const defaultAllServers: readonly CharacterServer[] = [
    { id: 'all-voyage', name: 'Voyage1', status: 'green' },
    { id: 'all-jade', name: '翡翠海', status: 'green' },
    { id: 'all-flame', name: '赤焰要塞', status: 'yellow' },
    { id: 'all-frost', name: '霜月平原', status: 'green' },
    { id: 'all-shadow', name: '暗影峡谷', status: 'yellow' },
    { id: 'all-dragon', name: '龙骨荒原', status: 'green' },
    { id: 'all-starfall', name: '星落港', status: 'yellow' },
    { id: 'all-sky', name: '苍穹城', status: 'green' },
    { id: 'all-beginner', name: '新手村', status: 'green' },
    { id: 'all-tide', name: '潮汐湾', status: 'red' },
    { id: 'all-sand', name: '沙海商路', status: 'gray' },
    { id: 'all-peak', name: '雪峰关', status: 'yellow' },
    { id: 'all-ruin', name: '遗迹谷', status: 'red' },
    { id: 'all-mine', name: '黑石矿脉', status: 'gray' },
    { id: 'all-forest', name: '密林哨站', status: 'green' },
    { id: 'all-harbor', name: '南风港', status: 'yellow' },
    { id: 'all-oasis', name: '绿洲营地', status: 'gray' },
    { id: 'all-storm', name: '风暴岛', status: 'red' },
];

export const CharacterManage = defineView<CharacterManageParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    const players = params.players ?? defaultPlayers;
    const recommendServers = params.recommendServers ?? defaultRecommendServers;
    const allServers = params.allServers ?? defaultAllServers;
    const [tab, setTab] = useState<CharacterManageTabId>('mine');
    const [selectedId, setSelectedId] = useState(params.selectedPlayerId ?? players[0]?.id ?? '');
    const servers = tab === 'all' ? allServers : recommendServers;
    const playerSource = useMemo(() => new ArrayVirtualListDataSource(players), [players]);
    const serverSource = useMemo(() => new ArrayVirtualListDataSource(servers), [servers]);
    const playerList = useRef<VirtualCollectionController | null>(null);
    const serverList = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => playerSource.dispose(), [playerSource]);
    useEffect(() => () => serverSource.dispose(), [serverSource]);
    useEffect(() => {
        if (tab === 'mine') playerList.current?.scrollToIndex(0, 'start', 0);
        else serverList.current?.scrollToIndex(0, 'start', 0);
    }, [tab, playerSource, serverSource]);
    const selectPlayer = (id: string) => {
        setSelectedId(id);
        params.onSelectPlayer?.(id);
    };
    const showPlayers = tab === 'mine';
    const panelLeft = 21;
    const panelTop = 316;
    return (
        <view name="CharacterManagePage" style={{ width: 750, height: 1624 }}>
            <PopupFrame title={params.title ?? '角色管理'} left={panelLeft} top={panelTop}
                width={708} height={992} onClose={params.onClose} />
            <view name="CharacterManage/Content"
                style={{ position: 'absolute', left: panelLeft, top: panelTop, width: 708, height: 992 }}>
                <TabBar skin={characterTab} left={37} top={102} itemWidth={195} gap={25} width={671}
                    selected={tab} items={tabs}
                    onSelect={(id) => { if (id === 'mine' || id === 'recommend' || id === 'all') setTab(id); }} />
                <image source={imageRef('ui/character/content')}
                    style={{ position: 'absolute', left: CONTENT.left, top: CONTENT.top,
                        width: CONTENT.width, height: CONTENT.height, sizeMode: 'sliced' }} />
                <VirtualList visible={showPlayers} source={playerSource} key="id" direction="vertical"
                    itemSize={PLAYER_LIST.itemSize} gap={PLAYER_LIST.gap} overscan={1}
                    controller={playerList} inertia elastic
                    style={{ position: 'absolute', left: PLAYER_LIST.left, top: PLAYER_LIST.top,
                        width: PLAYER_LIST.width, height: playerListHeight }}>
                    {(item) => <CharacterPlayerRow name={item.name} level={item.level} server={item.server}
                        selected={item.id === selectedId} onSelect={() => selectPlayer(item.id)} />}
                </VirtualList>
                <VirtualList visible={!showPlayers} source={serverSource} key="id" layout="grid" lanes={2}
                    direction="vertical" itemSize={SERVER_LIST.itemSize} gap={SERVER_LIST.gap}
                    crossGap={SERVER_LIST.crossGap} overscan={2}
                    controller={serverList} inertia elastic
                    style={{ position: 'absolute', left: SERVER_LIST.left, top: SERVER_LIST.top,
                        width: SERVER_LIST.width, height: serverListHeight }}>
                    {(item) => <CharacterServerItem name={item.name} status={item.status}
                        onSelect={() => params.onSelectServer?.(item.id)} />}
                </VirtualList>
                <text visible={!showPlayers} value="每个服务器可创建2名角色"
                    style={{ position: 'absolute', left: CREATE_HINT.left, top: CREATE_HINT.top,
                        width: CREATE_HINT.width, height: CREATE_HINT.height,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#837A91', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            </view>
        </view>
    );
});
