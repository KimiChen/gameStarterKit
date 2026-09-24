import { defineComponent, For, useMemo } from '@uniflex/compiler';
import { type ImageRef } from '../../../kits/uniflex/api/core/index';
import { Tab, type TabSkin } from './Tab';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export { allianceTab, characterTab, flagTab, heroDetailTab, heroListTab, mailTab, mailPopupTab } from './tabSkins';
export type { TabSkin };

export interface TabBarItem {
    readonly id: string;
    readonly label: string;
    readonly badge?: number;
    readonly notice?: boolean;
    /** Optional exact position in the content row, before selected-state overhang padding. */
    readonly left?: number;
}

export interface TabBarProps {
    readonly theme?: ComponentTheme;
    readonly items: readonly TabBarItem[];
    readonly selected: string;
    readonly left: number;
    readonly top: number;
    readonly itemWidth: number;
    readonly skin: TabSkin;
    readonly width: number;
    readonly gap?: number;
    readonly onSelect?: (id: string, index: number) => void;
    readonly badgeSource?: ImageRef;
    readonly noticeSource?: ImageRef;
    readonly badgeTop?: number;
}

interface TabBarRow {
    readonly id: string;
    readonly label: string;
    readonly badge: number;
    readonly notice: boolean;
    readonly active: boolean;
    readonly left: number;
    readonly index: number;
}

function stampTabs(
    items: readonly TabBarItem[],
    selected: string,
    itemWidth: number,
    gap: number,
    padLeft: number,
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
            notice: item.notice === true,
            active: item.id === selected,
            left: padLeft + (item.left ?? i * stride),
            index: i,
        });
        i += 1;
    }
    return rows;
}

/** Lays out tabs by stride or item.left; width is the viewport and overflow scrolls. */
export const TabBar = defineComponent<TabBarProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const items = p.items;
    const selected = p.selected;
    const left = p.left;
    const top = p.top;
    const itemWidth = p.itemWidth;
    const gap = p.gap ?? p.theme?.tab.gap ?? activeTheme.tab.gap;
    const skin = p.skin;
    const onSelect = p.onSelect;
    const badgeSource = p.badgeSource;
    const noticeSource = p.noticeSource;
    const badgeTopOverride = p.badgeTop;
    const activeTop = skin.activeTop ?? p.theme?.tab.activeTop ?? activeTheme.tab.activeTop;
    const activeLeft = skin.activeLeft ?? p.theme?.tab.activeLeft ?? activeTheme.tab.activeLeft;
    const activeWidth = skin.activeWidth ?? p.theme?.tab.activeWidth ?? activeTheme.tab.activeWidth;
    const idleHeight = skin.height ?? p.theme?.tab.height ?? activeTheme.tab.height;
    const selectedHeight = skin.activeHeight ?? p.theme?.tab.activeHeight ?? activeTheme.tab.activeHeight;
    const badgeIdleTop = p.badgeTop ?? skin.badgeTop ?? p.theme?.tab.badgeTop ?? activeTheme.tab.badgeTop;
    const liftPad = activeTop < 0 ? -activeTop : 0;
    const badgePad = badgeIdleTop < 0 ? -badgeIdleTop : 0;
    const padTop = liftPad < badgePad ? badgePad : liftPad;
    const overhangLeft = activeLeft < 0 ? -activeLeft : 0;
    const rightExtra = activeLeft + activeWidth;
    const overhangRight = rightExtra > 0 ? rightExtra : 0;
    const idleBar = padTop + idleHeight;
    const activeBarTop = padTop + (activeTop < 0 ? activeTop : 0);
    const activeBar = (activeBarTop < 0 ? 0 : activeBarTop) + selectedHeight;
    const barHeight = idleBar < activeBar ? activeBar : idleBar;
    const barWidth = p.width;
    const barTop = top - padTop;
    const chipTop = padTop;
    const rows = useMemo(() => stampTabs(items, selected, itemWidth, gap, overhangLeft), [items, selected, itemWidth, gap, overhangLeft]);
    const innerWidth = rows.reduce((edge, row) => Math.max(edge, row.left + itemWidth + overhangRight), barWidth);
    const track = skin.track;
    const showTrack = track !== undefined;
    const trackSource = track ?? theme.tab.selected;
    return (
        <view name="TabBar" style={{ position: 'absolute', left: left, top: barTop, width: barWidth, height: barHeight }}>
            <image name="TabBar/Base" visible={showTrack} source={trackSource}
                style={{ position: 'absolute', left: 0, top: chipTop, width: barWidth, height: idleHeight }} />
            <scroll-view name="TabBar/Scroll" direction="horizontal" inertia
                style={{ position: 'absolute', left: 0, top: 0, width: barWidth, height: barHeight }}>
                <view name="TabBar/Track" style={{ width: innerWidth, height: barHeight }}>
                    <For each={rows} key="id">
                        {(item) => (
                            <Tab theme={theme} label={item.label} active={item.active} left={item.left} top={chipTop}
                                width={itemWidth} skin={skin} badge={item.badge} notice={item.notice}
                                badgeSource={badgeSource} noticeSource={noticeSource}
                                badgeTop={badgeTopOverride}
                                onClick={() => onSelect?.(item.id, item.index)} />
                        )}
                    </For>
                </view>
            </scroll-view>
        </view>
    );
});
