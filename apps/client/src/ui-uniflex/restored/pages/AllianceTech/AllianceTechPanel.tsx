import { defineComponent, For, useMemo } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { IconCaptionButton } from '../../components/button/IconCaptionButton';
import { ScreenFooter } from '../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../components/chrome/ScreenHeader';
import { AllianceTechLink, type AllianceTechLinkData } from './AllianceTechLink';
import { AllianceTechNode, allianceTechNodeSize, type AllianceTechNodeData } from './AllianceTechNode';

export interface AllianceTechPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly rankLabel?: string;
    readonly nodes?: readonly AllianceTechNodeData[];
    readonly onBack?: () => void;
    readonly onAction?: (id: string) => void;
}

const TREE_BG_H = 1399;
const SCROLL_TOP = 112;
const FOOTER_TOP = 1369;
const SCROLL_HEIGHT = FOOTER_TOP - SCROLL_TOP;
const LINE_THICK = 12;
const LINE_GOLD = '#F0B429';
const LINE_GRAY = '#5E5E5E';

/** Content origin is the tree background top-left (page y=112). */
export const DEFAULT_ALLIANCE_TECH_NODES: readonly AllianceTechNodeData[] = [
    { id: 'shield', kind: 'shield', left: 294, top: 158, level: 5, maxLevel: 5 },
    { id: 'heart', kind: 'heart', left: 57, top: 421, parentIds: ['shield'], level: 1, maxLevel: 5 },
    { id: 'swords', kind: 'swords', left: 529, top: 420, parentIds: ['shield'], level: 1, maxLevel: 5 },
    { id: 'crate-left', kind: 'crate', left: 56, top: 700, parentIds: ['heart'], locked: true, level: 0, maxLevel: 5 },
    { id: 'crate-right', kind: 'crate', left: 529, top: 700, parentIds: ['swords'], locked: true, level: 0, maxLevel: 5 },
    { id: 'crate-mid', kind: 'crate', left: 294, top: 972, parentIds: ['crate-left', 'crate-right'], locked: true, level: 0, maxLevel: 5 },
    { id: 'crate-bot-left', kind: 'crate', left: 56, top: 1244, parentIds: ['crate-mid'], locked: true, level: 0, maxLevel: 5 },
    { id: 'crate-bot-right', kind: 'crate', left: 529, top: 1244, parentIds: ['crate-mid'], locked: true, level: 0, maxLevel: 5 },
];

function techCenterX(node: AllianceTechNodeData): number {
    return node.left + allianceTechNodeSize(node.kind).width / 2;
}

function techBottom(node: AllianceTechNodeData): number {
    return node.top + allianceTechNodeSize(node.kind).height;
}

function pushLink(
    out: AllianceTechLinkData[],
    id: string,
    left: number,
    top: number,
    width: number,
    height: number,
    color: string,
): void {
    if (width < 1 || height < 1) return;
    out.push({
        id,
        left: Math.round(left),
        top: Math.round(top),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        color,
    });
}

export function buildAllianceTechLinks(nodes: readonly AllianceTechNodeData[]): AllianceTechLinkData[] {
    const byId = new Map<string, AllianceTechNodeData>();
    nodes.forEach((node) => {
        byId.set(node.id, node);
    });
    const out: AllianceTechLinkData[] = [];
    nodes.forEach((child) => {
        const parents = child.parentIds ?? [];
        const unlocked = child.locked !== true && child.level > 0;
        const color = unlocked ? LINE_GOLD : LINE_GRAY;
        const cx = techCenterX(child);
        const cy = child.top;
        parents.forEach((parentId) => {
            const parent = byId.get(parentId);
            if (parent == null) return;
            const px = techCenterX(parent);
            const py = techBottom(parent);
            const join = (py + cy) / 2;
            const half = LINE_THICK / 2;
            pushLink(out, `${child.id}-${parentId}-v1`, px - half, py, LINE_THICK, join - py, color);
            pushLink(out, `${child.id}-${parentId}-h`, Math.min(px, cx) - half, join - half, Math.abs(cx - px) + LINE_THICK, LINE_THICK, color);
            pushLink(out, `${child.id}-${parentId}-v2`, cx - half, join, LINE_THICK, cy - join, color);
        });
    });
    return out;
}

export function allianceTechContentHeight(nodes: readonly AllianceTechNodeData[]): number {
    let bottom = TREE_BG_H;
    nodes.forEach((node) => {
        const next = techBottom(node) + 80;
        if (next > bottom) bottom = next;
    });
    return bottom;
}

export const AllianceTechPanel = defineComponent<AllianceTechPanelProps>((p) => {
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    const rankIcon = imageRef('ui/alliance/tech-rank');
    const rankLabel = p.rankLabel ?? '排行榜';
    const nodes = p.nodes ?? DEFAULT_ALLIANCE_TECH_NODES;
    const links = useMemo(() => buildAllianceTechLinks(nodes), [nodes]);
    const contentHeight = allianceTechContentHeight(nodes);
    const emit = (id: string) => p.onAction?.(`tech_${id}`);
    return (
        <view name="AllianceTech" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <view style={{ position: 'absolute', left: 0, top: 138, width: 750, height: 212, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 222, width: 750, height: 1404, backgroundColor: '#1E2240' }} />

            <scroll-view name="AllianceTech/Tree" direction="vertical" inertia elastic
                style={{ position: 'absolute', left: 0, top: SCROLL_TOP, width: 750, height: SCROLL_HEIGHT }}>
                <view name="AllianceTech/TreeContent"
                    style={{ width: 750, height: contentHeight, backgroundColor: '#1E2240' }}>
                    <image source={imageRef('ui/alliance/tech-tree-bg')}
                        style={{ position: 'absolute', left: 0, top: 0, width: 750, height: TREE_BG_H }} />
                    <For each={links} key="id">
                        {(link) => <AllianceTechLink link={link} />}
                    </For>
                    <For each={nodes} key="id">
                        {(node) => <AllianceTechNode node={node} onClick={() => emit(node.id)} />}
                    </For>
                </view>
            </scroll-view>

            <image source={imageRef('ui/alliance/tech-fade-top')}
                style={{ position: 'absolute', left: 0, top: 225, width: 750, height: 21 }} />
            <image source={imageRef('ui/alliance/tech-fade-bot')}
                style={{ position: 'absolute', left: 0, top: 1357, width: 750, height: 20 }} />

            <ScreenHeader title={p.title ?? '科技'} top={144} titleTop={169} titleHeight={50} />

            <ScreenFooter top={FOOTER_TOP} onBack={back} />
            <IconCaptionButton icon={rankIcon} label={rankLabel} left={646} top={1376}
                iconWidth={82} iconHeight={78} labelTop={71} labelHeight={26}
                onClick={() => p.onAction?.('open_tech_rank')} />
        </view>
    );
});
