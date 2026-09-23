import { defineComponent, Floating, useEffect, useMemo, useState, VirtualList } from '@uniflex/compiler';
import { ArrayVirtualListDataSource } from '../../../kits/uniflex/api/core/index';

import type { DropdownItem, DropdownProps, DropdownSkin } from './DropdownSkin';
export type { DropdownIcon, DropdownItem, DropdownProps, DropdownRect, DropdownSkin } from './DropdownSkin';

interface DropdownOptionProps {
    readonly item: DropdownItem;
    readonly selected: string;
    readonly skin: DropdownSkin;
    readonly onSelect: (id: string) => void;
}

const DropdownOption = defineComponent<DropdownOptionProps>((p) => {
    const item = p.item;
    const skin = p.skin;
    const width = skin.panelWidth;
    const height = skin.itemHeight;
    const padding = skin.padding;
    const markWidth = width - padding * 2;
    const active = item.id === p.selected;
    const disabled = item.disabled === true;
    const opacity = disabled ? 0.45 : 1;
    const label = item.label;
    const icon = item.icon;
    const iconSource = icon?.source ?? skin.background;
    const showIcon = icon !== undefined;
    const iconLeft = icon?.left ?? 0;
    const iconTop = icon?.top ?? 0;
    const iconWidth = icon?.width ?? 0;
    const iconHeight = icon?.height ?? 0;
    const labelLeft = skin.itemLabel.left;
    const labelTop = skin.itemLabel.top;
    const labelWidth = skin.itemLabel.width;
    const labelHeight = skin.itemLabel.height;
    const font = skin.font;
    const fontSize = skin.fontSize;
    const color = skin.color;
    const mark = skin.selectedBackground;
    return (
        <view name="Dropdown/Option" interaction="press" interactable={!disabled} accessibilityLabel={label}
            onClick={() => p.onSelect(item.id)} style={{ position: 'relative', width: width, height: height, opacity: opacity }}>
            <image visible={active} source={mark}
                style={{ position: 'absolute', left: padding, top: 0, width: markWidth, height: height }} />
            <image visible={showIcon} source={iconSource}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <text value={label} style={{ position: 'absolute', left: labelLeft, top: labelTop, width: labelWidth, height: labelHeight,
                font: font, fontSize: fontSize, color: color, bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});

/** Single-select dropdown. Floating owns outside-click dismissal; long option lists scroll. */
export const Dropdown = defineComponent<DropdownProps>((p) => {
    const [open, setOpen] = useState(false);
    const items = p.items;
    const selected = p.selected;
    const skin = p.skin;
    const disabled = p.disabled === true || items.length === 0;
    const expanded = open && !disabled;
    const left = p.left;
    const top = p.top;
    const width = skin.width;
    const height = skin.height;
    const panelWidth = skin.panelWidth;
    const itemHeight = skin.itemHeight;
    const padding = skin.padding;
    const gap = skin.gap;
    const placement = p.placement ?? 'auto';
    const limit = Math.max(1, Math.floor(p.maxVisibleItems ?? 6));
    const listHeight = Math.min(items.length, limit) * itemHeight;
    const panelHeight = listHeight + padding * 2;
    const current = useMemo(() => items.find((item) => item.id === selected), [items, selected]);
    const source = useMemo(() => new ArrayVirtualListDataSource(items), [items]);
    useEffect(() => () => source.dispose(), [source]);
    useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
    const label = current?.label ?? p.placeholder ?? '';
    const icon = current?.triggerIcon ?? current?.icon;
    const iconSource = icon?.source ?? skin.background;
    const showIcon = icon !== undefined;
    const iconLeft = icon?.left ?? 0;
    const iconTop = icon?.top ?? 0;
    const iconWidth = icon?.width ?? 0;
    const iconHeight = icon?.height ?? 0;
    const labelLeft = skin.triggerLabel.left;
    const labelTop = skin.triggerLabel.top;
    const labelWidth = skin.triggerLabel.width;
    const labelHeight = skin.triggerLabel.height;
    const font = skin.font;
    const fontSize = skin.fontSize;
    const color = skin.color;
    const background = skin.background;
    const panelBackground = skin.panelBackground;
    const arrow = expanded ? skin.arrowUp : skin.arrowDown;
    const arrowLeft = skin.arrow.left;
    const arrowTop = expanded ? skin.arrowOpenTop : skin.arrow.top;
    const arrowWidth = skin.arrow.width;
    const arrowHeight = skin.arrow.height;
    const opacity = disabled ? 0.45 : 1;
    const pick = (id: string) => {
        const item = items.find((entry) => entry.id === id);
        if (disabled || !item || item.disabled) return;
        setOpen(false);
        p.onSelect?.(id);
    };
    return (
        <view name="Dropdown" style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <Floating open={expanded} onOpenChange={setOpen} placement={placement} align="end" gap={gap} viewportPadding={0}
                style={{ width: width, height: height }}>
                <view name="Dropdown/Trigger" interaction="press" interactable={!disabled} accessibilityLabel={label}
                    onClick={() => { if (!disabled) setOpen(!open); }} style={{ width: width, height: height, opacity: opacity }}>
                    <image source={background} style={{ position: 'absolute', width: width, height: height }} />
                    <image visible={showIcon} source={iconSource}
                        style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
                    <text name="Dropdown/Value" value={label}
                        style={{ position: 'absolute', left: labelLeft, top: labelTop, width: labelWidth, height: labelHeight,
                            font: font, fontSize: fontSize, color: color, bold: true, verticalAlign: 'center', overflow: 'shrink' }} />
                    <image source={arrow}
                        style={{ position: 'absolute', left: arrowLeft, top: arrowTop, width: arrowWidth, height: arrowHeight }} />
                </view>
                <view name="Dropdown/Panel" style={{ width: panelWidth, height: panelHeight }}>
                    <image source={panelBackground} style={{ position: 'absolute', width: panelWidth, height: panelHeight }} />
                    <VirtualList source={source} key="id" direction="vertical" itemSize={itemHeight} initialRender={false} inertia
                        style={{ position: 'absolute', left: 0, top: padding, width: panelWidth, height: listHeight }}>
                        {(item) => <DropdownOption item={item} selected={selected} skin={skin} onSelect={pick} />}
                    </VirtualList>
                </view>
            </Floating>
        </view>
    );
});
