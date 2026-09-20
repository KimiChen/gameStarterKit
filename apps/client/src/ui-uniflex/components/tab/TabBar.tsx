import { defineComponent, For, useMemo } from '@uniflex/compiler';
import { imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../badge/NotificationBadge';
import { PanelTab } from './PanelTab';

export interface TabBarItem {
    readonly id: string;
    readonly label: string;
    readonly badge?: number;
}

export interface TabBarProps {
    readonly items: readonly TabBarItem[];
    readonly selected: string;
    readonly left: number;
    readonly top: number;
    readonly itemWidth: number;
    readonly width?: number;
    readonly gap?: number;
    readonly kind?: 'mail' | 'flag' | 'alliance';
    readonly onSelect?: (id: string, index: number) => void;
    readonly badgeSource?: ImageRef;
    readonly badgeTop?: number;
}

interface TabBarRow {
    readonly id: string;
    readonly label: string;
    readonly badge: number;
    readonly active: boolean;
    readonly left: number;
    readonly index: number;
}

const DEFAULT_GAP = 14;
const BADGE_INSET = 26;
const DEFAULT_BADGE_LIFT = 14;
const BAR_HEIGHT = 67;
const PAGE_WIDTH = 750;

function stampTabs(
    items: readonly TabBarItem[],
    selected: string,
    itemWidth: number,
    gap: number,
): readonly TabBarRow[] {
    const rows: TabBarRow[] = [];
    const stride = itemWidth + gap;
    let i = 0;
    const total = items.length;
    while (i < total) {
        const item = items[i];
        rows.push({
            id: item.id,
            label: item.label,
            badge: item.badge ?? 0,
            active: item.id === selected,
            left: i * stride,
            index: i,
        });
        i += 1;
    }
    return rows;
}

/** Lays out `PanelTab` chips from `left` + `itemWidth` + `gap`. Overflow scrolls horizontally. */
export const TabBar = defineComponent<TabBarProps>((p) => {
    const items = p.items;
    const selected = p.selected;
    const left = p.left;
    const top = p.top;
    const itemWidth = p.itemWidth;
    const gap = p.gap ?? DEFAULT_GAP;
    const kind = p.kind;
    const onSelect = p.onSelect;
    const flag = kind === 'flag';
    const padTop = flag ? 14 : 15;
    const barWidth = p.width ?? PAGE_WIDTH - left;
    const barTop = top - padTop;
    const barHeight = BAR_HEIGHT;
    const chipTop = padTop;
    const badgeSource = p.badgeSource ?? imageRef('ui/mail/number-badge');
    const badgeTop = p.badgeTop ?? top - DEFAULT_BADGE_LIFT;
    const badgeOffset = badgeTop - barTop;
    const badgeLocalTop = badgeOffset < 0 ? 0 : badgeOffset;
    const badgeLeft = itemWidth - BADGE_INSET;
    const count = items.length;
    const contentWidth = count === 0 ? barWidth : count * itemWidth + (count - 1) * gap;
    const innerWidth = contentWidth < barWidth ? barWidth : contentWidth;
    const rows = useMemo(() => stampTabs(items, selected, itemWidth, gap), [items, selected, itemWidth, gap]);
    return (
        <scroll-view name="TabBar" direction="horizontal" inertia
            style={{ position: 'absolute', left: left, top: barTop, width: barWidth, height: barHeight }}>
            <view name="TabBar/Track" style={{ width: innerWidth, height: barHeight }}>
                <For each={rows} key="id">
                    {(item) => (
                        <view name="TabBar/Item"
                            style={{ position: 'absolute', left: item.left, top: 0, width: itemWidth, height: barHeight }}>
                            <PanelTab label={item.label} active={item.active} left={0} top={chipTop}
                                width={itemWidth} kind={kind}
                                onClick={() => onSelect?.(item.id, item.index)} />
                            <NotificationBadge count={item.badge} source={badgeSource}
                                left={badgeLeft} top={badgeLocalTop} />
                        </view>
                    )}
                </For>
            </view>
        </scroll-view>
    );
});
