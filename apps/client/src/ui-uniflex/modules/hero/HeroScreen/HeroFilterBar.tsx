import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { Dropdown, type DropdownItem } from '../../../components/dropdown/Dropdown';
import { filterDropdown } from '../../../components/dropdown/dropdownSkins';

export type HeroFilterId = 'all' | 'shield' | 'sword' | 'anchor' | 'unowned';

export interface HeroFilterBarProps {
    readonly selected?: HeroFilterId;
    readonly onSelect?: (id: HeroFilterId) => void;
}

const HERO_FILTER_ITEMS: readonly DropdownItem[] = [
    { id: 'all', label: '全部',
        icon: { source: imageRef('ui/hero/filter-icon'), left: 16, top: 12, width: 29, height: 27 },
        triggerIcon: { source: imageRef('ui/hero/filter-icon'), left: 15, top: 13, width: 29, height: 27 } },
    { id: 'shield', label: '盾',
        icon: { source: imageRef('ui/hero/class-shield'), left: 16, top: 8, width: 26, height: 32 },
        triggerIcon: { source: imageRef('ui/hero/class-shield'), left: 15, top: 8, width: 26, height: 32 } },
    { id: 'sword', label: '剑',
        icon: { source: imageRef('ui/hero/class-sword'), left: 16, top: 8, width: 26, height: 32 },
        triggerIcon: { source: imageRef('ui/hero/class-sword'), left: 15, top: 8, width: 26, height: 32 } },
    { id: 'anchor', label: '锚',
        icon: { source: imageRef('ui/hero/class-anchor'), left: 16, top: 8, width: 26, height: 32 },
        triggerIcon: { source: imageRef('ui/hero/class-anchor'), left: 15, top: 8, width: 26, height: 32 } },
    { id: 'unowned', label: '未获得',
        icon: { source: imageRef('ui/hero/filter-option-icon'), left: 17, top: 12, width: 26, height: 27 },
        triggerIcon: { source: imageRef('ui/hero/filter-option-icon'), left: 16, top: 13, width: 26, height: 27 } },
];

/** Hero-specific choices and placement; selection is owned by HeroListPanel. */
export const HeroFilterBar = defineComponent<HeroFilterBarProps>((p) => {
    const select = (id: string) => {
        if (id === 'all' || id === 'shield' || id === 'sword' || id === 'anchor' || id === 'unowned') p.onSelect?.(id);
    };
    return (
        <Dropdown items={HERO_FILTER_ITEMS} selected={p.selected ?? 'all'} skin={filterDropdown}
            left={456} top={98} onSelect={select} />
    );
});
