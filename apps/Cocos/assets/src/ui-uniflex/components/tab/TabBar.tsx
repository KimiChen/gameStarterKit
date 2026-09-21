import { defineComponent, For, useMemo } from '@uniflex/compiler';
import { type ImageRef } from '../../../kits/uniflex/api/core/index';
import { Tab, type TabSkin } from './Tab';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export { allianceTab, characterTab, flagTab, heroDetailTab, heroListTab, mailTab } from './tabSkins';
export type { TabSkin };

export interface TabBarItem {
    readonly id: string;
    readonly label: string;
    readonly badge?: number;
    readonly notice?: boolean;
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
            left: i * stride,
            index: i,
        });
        i += 1;
    }
    return rows;
}

/** Lays out `Tab` chips from `left` + `itemWidth` + `gap`. Pass `width` for the bar; overflow scrolls. */
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
    const idleHeight = skin.height ?? p.theme?.tab.height ?? activeTheme.tab.height;
    const selectedHeight = skin.activeHeight ?? p.theme?.tab.activeHeight ?? activeTheme.tab.activeHeight;
    const badgeIdleTop = p.badgeTop ?? skin.badgeTop ?? p.theme?.tab.badgeTop ?? activeTheme.tab.badgeTop;
    const liftPad = activeTop < 0 ? -activeTop : 0;
    const badgePad = badgeIdleTop < 0 ? -badgeIdleTop : 0;
    const padTop = liftPad < badgePad ? badgePad : liftPad;
    const idleBar = padTop + idleHeight;
    const activeBarTop = padTop + (activeTop < 0 ? activeTop : 0);
    const activeBar = (activeBarTop < 0 ? 0 : activeBarTop) + selectedHeight;
    const barHeight = idleBar < activeBar ? activeBar : idleBar;
    const barWidth = p.width;
    const barTop = top - padTop;
    const chipTop = padTop;
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
                            <Tab theme={theme} label={item.label} active={item.active} left={0} top={chipTop}
                                width={itemWidth} skin={skin} badge={item.badge} notice={item.notice}
                                badgeSource={badgeSource} noticeSource={noticeSource}
                                badgeTop={badgeTopOverride}
                                onClick={() => onSelect?.(item.id, item.index)} />
                        </view>
                    )}
                </For>
            </view>
        </scroll-view>
    );
});
