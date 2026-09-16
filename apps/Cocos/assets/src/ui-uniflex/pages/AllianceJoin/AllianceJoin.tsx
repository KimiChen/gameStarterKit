import { defineView, useEffect, useMemo, useRef, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource, fontRef, imageRef, type VirtualCollectionController } from '../../../kits/uniflex/api/core/index';
import { AllianceCreatePanel } from '../AllianceCreate/AllianceCreatePanel';
import { AllianceJoinRow } from './AllianceJoinRow';

export interface AllianceJoinItem {
    readonly id: string;
    readonly name: string;
    readonly members: string;
    readonly minLevel: string;
    readonly power: string;
    readonly joinType: string;
}

export interface AllianceJoinParams {
    readonly title?: string;
    readonly alliances?: readonly AllianceJoinItem[];
    readonly onBack?: () => void;
    readonly onSearch?: (query: string) => void;
    readonly onCreate?: () => void;
    readonly onJoin?: (id: string) => void;
    readonly onAction?: (id: string) => void;
}

const FIELD = '#6F6555';
const ROW_SIZE = 135;
const ROW_GAP = 8;

const defaultAlliances: readonly AllianceJoinItem[] = [
    { id: 'a0', name: '[FTB]该头卢曼仔', members: '66/70', minLevel: '等级≥50', power: '500M', joinType: '需要申请' },
    { id: 'a1', name: '[FTB]该头卢曼仔', members: '66/70', minLevel: '等级≥50', power: '500M', joinType: '需要申请' },
    { id: 'a2', name: '[FTB]该头卢曼仔', members: '66/70', minLevel: '等级≥50', power: '500M', joinType: '所有人均可加入' },
    { id: 'a3', name: '[FTB]该头卢曼仔', members: '66/70', minLevel: '等级≥50', power: '500M', joinType: '所有人均可加入' },
];

export const AllianceJoin = defineView<AllianceJoinParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    const [query, setQuery] = useState('');
    const [applied, setApplied] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const alliances = params.alliances ?? defaultAlliances;
    const items = useMemo(() => {
        const q = applied.trim();
        if (q === '') return alliances;
        return alliances.filter((item) => item.name.indexOf(q) >= 0);
    }, [alliances, applied]);
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    const list = useRef<VirtualCollectionController | null>(null);
    useEffect(() => () => source.dispose(), [source]);
    const search = () => {
        setApplied(query);
        params.onSearch?.(query);
        params.onAction?.('search_alliance');
    };
    const openCreate = () => {
        setCreateOpen(true);
        params.onAction?.('open_create_alliance');
    };
    return (
        <view name="AllianceJoin" style={{ width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 224, width: 750, height: 1400, backgroundColor: '#F3EFE9' }} />

            <image source={imageRef('ui/alliance/join-banner')}
                style={{ position: 'absolute', left: 14, top: 251, width: 723, height: 200 }} />

            <image source={imageRef('ui/alliance/input-bg')}
                style={{ position: 'absolute', left: 15, top: 455, width: 501, height: 64, sizeMode: 'sliced' }} />
            <input value={query} placeholder="" onInput={setQuery}
                style={{ position: 'absolute', left: 15, top: 455, width: 501, height: 64,
                    fontSize: 26, color: FIELD, textAlign: 'center' }} />
            <text visible={query === ''} value="点击此处输入想要搜索的联盟"
                style={{ position: 'absolute', left: 15, top: 455, width: 501, height: 64,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: FIELD, bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view name="AllianceJoin/Search" interaction="press" onClick={search}
                style={{ position: 'absolute', left: 521, top: 452, width: 72, height: 70 }}>
                <image source={imageRef('ui/alliance/join-search')} style={{ width: 72, height: 70 }} />
            </view>
            <view name="AllianceJoin/Create" interaction="press" onClick={openCreate}
                style={{ position: 'absolute', left: 597, top: 452, width: 139, height: 70 }}>
                <image source={imageRef('ui/alliance/join-create-bg')} style={{ width: 139, height: 70 }} />
                <text value="创建"
                    style={{ position: 'absolute', left: 0, top: 0, width: 139, height: 70,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#ffffff', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>

            <image source={imageRef('ui/alliance/input-bg')}
                style={{ position: 'absolute', left: 17, top: 524, width: 719, height: 816, sizeMode: 'sliced' }} />
            <VirtualList source={source} key="id" direction="vertical" itemSize={ROW_SIZE} gap={ROW_GAP}
                overscan={2} controller={list} inertia elastic
                style={{ position: 'absolute', left: 22, top: 533, width: 709, height: 807 }}>
                {(item) => <AllianceJoinRow name={item.name} members={item.members} minLevel={item.minLevel}
                    power={item.power} joinType={item.joinType}
                    onClick={() => params.onJoin?.(item.id)} />}
            </VirtualList>

            <image source={imageRef('ui/mail/header')}
                style={{ position: 'absolute', left: 0, top: 144, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={params.title ?? '加入一个联盟'}
                style={{ position: 'absolute', left: 38, top: 160, width: 400, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />

            <image source={imageRef('ui/mail/footer')}
                style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110, sizeMode: 'sliced' }} />
            <view name="AllianceJoin/Back" interaction="press" onClick={() => params.onBack?.()}
                style={{ position: 'absolute', left: 13, top: 1396, width: 64, height: 56 }}>
                <image source={imageRef('ui/mail/back')} style={{ width: 64, height: 56 }} />
            </view>

            <AllianceCreatePanel visible={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreate={() => { setCreateOpen(false); params.onCreate?.(); }} />
        </view>
    );
});
