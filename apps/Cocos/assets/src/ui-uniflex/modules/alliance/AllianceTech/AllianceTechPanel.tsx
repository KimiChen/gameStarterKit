import { defineComponent, For, useMemo, useState } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { IconCaptionButton } from '../../../components/button/IconCaptionButton';
import { SCREEN_FOOTER_HEIGHT, ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import {
    allianceTechMaxLevel,
    getAllianceTech,
    getPreviewTechRuntime,
} from '../../../gamecomponents/tech/allianceTech';
import { AllianceMarchBoostPanel } from '../AllianceMarchBoost/AllianceMarchBoostPanel';
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
const CANVAS_HEIGHT = 1624;
const SCROLL_TOP = 112;
const SCROLL_HEIGHT = CANVAS_HEIGHT - SCREEN_FOOTER_HEIGHT - SCROLL_TOP;
const LINE_THICK = 12;
const LINE_GOLD = '#F0B429';
const LINE_GRAY = '#5E5E5E';

function techNode(
    id: string,
    kind: AllianceTechNodeData['kind'],
    left: number,
    top: number,
    techId: number,
    locked = false,
    parentIds?: readonly string[],
): AllianceTechNodeData {
    const tech = getAllianceTech(techId);
    const runtime = getPreviewTechRuntime(techId);
    return {
        id,
        kind,
        left,
        top,
        parentIds,
        locked,
        techId,
        level: runtime.level,
        maxLevel: allianceTechMaxLevel(tech),
    };
}

/** Content origin is the tree background top-left (page y=112). */
export const DEFAULT_ALLIANCE_TECH_NODES: readonly AllianceTechNodeData[] = [
    techNode('shield', 'shield', 294, 158, 1011),
    techNode('heart', 'heart', 57, 421, 1021, false, ['shield']),
    techNode('swords', 'swords', 529, 420, 1022, false, ['shield']),
    techNode('crate-left', 'crate', 56, 700, 1031, true, ['heart']),
    techNode('crate-right', 'crate', 529, 700, 1041, true, ['swords']),
    techNode('crate-mid', 'crate', 294, 972, 1042, true, ['crate-left', 'crate-right']),
    techNode('crate-bot-left', 'crate', 56, 1244, 1051, true, ['crate-mid']),
    techNode('crate-bot-right', 'crate', 529, 1244, 1061, true, ['crate-mid']),
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
    const [detailTechId, setDetailTechId] = useState(0);
    const detailOpen = detailTechId > 0;
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    const closeDetail = () => setDetailTechId(0);
    const rankIcon = imageRef('ui/alliance/tech-rank');
    const rankLabel = p.rankLabel ?? '排行榜';
    const nodes = p.nodes ?? DEFAULT_ALLIANCE_TECH_NODES;
    const links = useMemo(() => buildAllianceTechLinks(nodes), [nodes]);
    const contentHeight = allianceTechContentHeight(nodes);
    const openTech = (node: AllianceTechNodeData) => {
        p.onAction?.(`tech_${node.id}`);
        const techId = node.techId;
        if (techId != null && techId > 0) setDetailTechId(techId);
    };
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
                        {(node) => <AllianceTechNode node={node} onClick={() => openTech(node)} />}
                    </For>
                </view>
            </scroll-view>

            <image source={imageRef('ui/alliance/tech-fade-top')}
                style={{ position: 'absolute', left: 0, top: 225, width: 750, height: 21 }} />
            <image source={imageRef('ui/alliance/tech-fade-bot')}
                style={{ position: 'absolute', left: 0, bottom: 102, width: 750, height: 20 }} />

            <ScreenHeader title={p.title ?? '科技'} top={144} titleTop={169} titleHeight={50} />

            <ScreenFooter onBack={back}>
                {() => (
                    <view style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
                        <IconCaptionButton icon={rankIcon} label={rankLabel} left={646} top={7}
                            iconWidth={82} iconHeight={78} labelTop={71} labelHeight={26}
                            onClick={() => p.onAction?.('open_tech_rank')} />
                    </view>
                )}
            </ScreenFooter>

            <AllianceMarchBoostPanel visible={detailOpen} techId={detailTechId}
                onClose={closeDetail}
                onPayGem={() => p.onAction?.('donate_gem')}
                onPayCoin={() => p.onAction?.('donate_coin')} />
        </view>
    );
});
