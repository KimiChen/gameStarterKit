import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import type { ButtonSkin } from './ButtonSkin';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export type { ButtonSkin } from './ButtonSkin';

export interface ActionButtonProps {
    readonly theme?: ComponentTheme;
    readonly skin?: ButtonSkin;
    /** Omit to draw a single image and no caption. */
    readonly label?: string;
    readonly source?: ImageRef;
    readonly outlineColor?: string;
    readonly labelColor?: string;
    readonly onClick?: () => void;
    readonly width?: number;
    readonly height?: number;
    /** Shrink a single image inside a larger hit box. Close uses this. */
    readonly imageInset?: number;
    readonly left?: number;
    readonly top?: number;
    readonly right?: number;
    readonly accessibilityLabel?: string;
    readonly disabled?: boolean;
    readonly icon?: ImageRef;
    readonly iconWidth?: number;
    readonly iconHeight?: number;
    /** Icon position within an icon-caption skin; inline icons remain centered with the label. */
    readonly iconLeft?: number;
    readonly iconTop?: number;
}

/** Shared background, icon and label nodes for inline, single-image and icon-caption skins. */
export const ActionButton = defineComponent<ActionButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const skin = p.skin;
    const label = p.label ?? '';
    const hasLabel = label !== '';
    const hasIcon = hasLabel && p.icon != null;
    const caption = skin?.layout === 'icon-caption';
    const inlineIcon = hasIcon && !caption;
    const source = p.source ?? skin?.source ?? (hasLabel ? theme.button.skins.confirm.source : p.icon) ?? theme.button.skins.confirm.source;
    const iconWidth = p.iconWidth ?? skin?.iconRect?.width ?? 48;
    const iconHeight = p.iconHeight ?? skin?.iconRect?.height ?? 48;
    const iconLabelWidth = Math.max(40, label.length * 26);
    const outlineColor = p.outlineColor ?? skin?.outline ?? theme.button.labelOutline;
    const labelColor = p.labelColor ?? skin?.labelColor ?? theme.button.label;
    const font = skin?.font ?? theme.button.font;
    const width = p.width ?? skin?.width ?? theme.button.width;
    const height = p.height ?? skin?.height ?? theme.button.height;
    const fontSize = skin?.fontSize ?? theme.button.fontSize;
    const labelLeft = p.theme?.button.labelLeft ?? activeTheme.button.labelLeft;
    const labelRight = p.theme?.button.labelRight ?? activeTheme.button.labelRight;
    const labelTop = p.theme?.button.labelTop ?? activeTheme.button.labelTop;
    const labelBottom = p.theme?.button.labelBottom ?? activeTheme.button.labelBottom;
    const iconGap = p.theme?.button.iconGap ?? activeTheme.button.iconGap;
    const sizeMode = skin?.sizeMode === 'sliced' ? 'sliced' : skin?.sizeMode === 'simple' ? 'simple' : hasLabel ? 'sliced' : 'simple';
    const outlineWidth = skin?.outlineWidth ?? 2;
    const inset = hasLabel ? 0 : Math.max(0, p.imageInset ?? 0);
    // Keep the original flex row's centering/shrink behavior without a separate IconRow node.
    const padLeft = inlineIcon ? labelLeft : 0;
    const padRight = inlineIcon ? labelRight : 0;
    const padTop = inlineIcon ? labelTop : 0;
    const padBottom = inlineIcon ? labelBottom : 0;
    const background = skin?.backgroundRect;
    const captionRect = caption ? skin?.labelRect : undefined;
    const placed = p.left != null ? true : p.top != null ? true : p.right != null;
    return (
        <view name="ActionButton" interaction="press" interactable={!p.disabled}
            accessibilityLabel={p.accessibilityLabel}
            onClick={() => { if (!p.disabled) p.onClick?.(); }}
            style={{ position: placed ? 'absolute' : undefined, left: p.left, top: p.top, right: p.right,
                width: width, height: height, opacity: p.disabled ? 0.5 : 1,
                padding: { left: padLeft, right: padRight, top: padTop, bottom: padBottom },
                flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: iconGap }}>
            <image name="ActionButton/Background" source={source}
                style={{ position: 'absolute', left: (background?.left ?? inset) - padLeft,
                    top: (background?.top ?? inset) - padTop,
                    right: background ? undefined : inset - padRight, bottom: background ? undefined : inset - padBottom,
                    width: background?.width, height: background?.height,
                    sizeMode: sizeMode }} />
            <image name="ActionButton/Icon" visible={hasIcon} source={p.icon ?? source}
                style={{ position: inlineIcon ? undefined : 'absolute',
                    left: inlineIcon ? undefined : p.iconLeft ?? skin?.iconRect?.left ?? 0,
                    top: inlineIcon ? undefined : p.iconTop ?? skin?.iconRect?.top ?? 0,
                    width: iconWidth, height: iconHeight }} />
            <text name="ActionButton/Label" visible={hasLabel} value={label}
                style={{ position: inlineIcon ? undefined : 'absolute',
                    left: inlineIcon ? undefined : captionRect?.left ?? labelLeft,
                    right: inlineIcon || captionRect ? undefined : labelRight,
                    top: inlineIcon ? undefined : captionRect?.top ?? labelTop,
                    bottom: inlineIcon || captionRect ? undefined : labelBottom,
                    width: inlineIcon ? iconLabelWidth : captionRect?.width,
                    height: inlineIcon ? '100%' : captionRect?.height,
                    font: font, fontSize: fontSize, bold: skin?.bold ?? false, color: labelColor,
                    outlineColor: outlineColor, outlineWidth: outlineWidth,
                    horizontalAlign: inlineIcon ? 'left' : 'center', verticalAlign: caption ? 'top' : 'center',
                    overflow: caption ? 'none' : 'shrink' }} />
        </view>
    );
});
