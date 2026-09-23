import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import type { DropdownSkin } from './DropdownSkin';

/** Original filter art, reusable independently of the hero filter options. */
export const filterDropdown: DropdownSkin = {
    background: imageRef('ui/hero/filter-bg'),
    panelBackground: imageRef('ui/hero/filter-dropdown'),
    selectedBackground: imageRef('ui/hero/filter-option'),
    arrowDown: imageRef('ui/hero/filter-arrow'),
    arrowUp: imageRef('ui/hero/filter-arrow-up'),
    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871',
    width: 280, height: 52, panelWidth: 281, itemHeight: 50, padding: 2, gap: 5,
    triggerLabel: { left: 54, top: 8, width: 170, height: 36 },
    itemLabel: { left: 55, top: 11, width: 180, height: 28 },
    arrow: { left: 236, top: 18, width: 34, height: 23 }, arrowOpenTop: 15,
};
