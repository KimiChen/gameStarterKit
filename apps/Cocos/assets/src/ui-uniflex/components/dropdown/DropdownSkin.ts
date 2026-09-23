import type { FontRef, ImageRef } from '../../../kits/uniflex/api/core/index';

export interface DropdownRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export interface DropdownIcon extends DropdownRect {
    readonly source: ImageRef;
}

export interface DropdownItem {
    readonly id: string;
    readonly label: string;
    readonly icon?: DropdownIcon;
    readonly triggerIcon?: DropdownIcon;
    readonly disabled?: boolean;
}

/** Art and geometry are supplied by the caller; the control has no domain-specific assets. */
export interface DropdownSkin {
    readonly background: ImageRef;
    readonly panelBackground: ImageRef;
    readonly selectedBackground: ImageRef;
    readonly arrowDown: ImageRef;
    readonly arrowUp: ImageRef;
    readonly font: FontRef;
    readonly fontSize: number;
    readonly color: string;
    readonly width: number;
    readonly height: number;
    readonly panelWidth: number;
    readonly itemHeight: number;
    readonly padding: number;
    readonly gap: number;
    readonly triggerLabel: DropdownRect;
    readonly itemLabel: DropdownRect;
    readonly arrow: DropdownRect;
    readonly arrowOpenTop: number;
}

export interface DropdownProps {
    readonly items: readonly DropdownItem[];
    /** Controlled value. Selecting an option requests a change through onSelect. */
    readonly selected: string;
    readonly skin: DropdownSkin;
    readonly left: number;
    readonly top: number;
    readonly onSelect?: (id: string) => void;
    readonly placeholder?: string;
    readonly disabled?: boolean;
    readonly maxVisibleItems?: number;
    readonly placement?: 'auto' | 'top' | 'bottom';
}
