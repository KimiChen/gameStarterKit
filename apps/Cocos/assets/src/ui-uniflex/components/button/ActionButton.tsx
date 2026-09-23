import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import type { ButtonSkin } from './ButtonSkin';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export type { ButtonSkin } from './ButtonSkin';

export interface ActionButtonProps {
    readonly theme?: ComponentTheme;
    readonly skin?: ButtonSkin;
    readonly label: string;
    readonly source?: ImageRef;
    readonly outlineColor?: string;
    readonly labelColor?: string;
    readonly onClick?: () => void;
    readonly width?: number;
    readonly height?: number;
    readonly disabled?: boolean;
    readonly icon?: ImageRef;
    readonly iconWidth?: number;
    readonly iconHeight?: number;
}

/** Shared hit area and nine-slice skin. Inject `skin` to swap art and outline. */
export const ActionButton = defineComponent<ActionButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const skin = p.skin;
    const hasIcon = p.icon != null;
    const source = p.source ?? skin?.source ?? theme.button.skins.confirm.source;
    const iconWidth = p.iconWidth ?? 48;
    const iconHeight = p.iconHeight ?? 48;
    const iconLabelWidth = Math.max(40, p.label.length * 26);
    const outlineColor = p.outlineColor ?? skin?.outline ?? theme.button.labelOutline;
    const labelColor = p.labelColor ?? skin?.labelColor ?? theme.button.label;
    const font = theme.button.font;
    const width = p.width ?? p.theme?.button.width ?? activeTheme.button.width;
    const height = p.height ?? p.theme?.button.height ?? activeTheme.button.height;
    const fontSize = p.theme?.button.fontSize ?? activeTheme.button.fontSize;
    const labelLeft = p.theme?.button.labelLeft ?? activeTheme.button.labelLeft;
    const labelRight = p.theme?.button.labelRight ?? activeTheme.button.labelRight;
    const labelTop = p.theme?.button.labelTop ?? activeTheme.button.labelTop;
    const labelBottom = p.theme?.button.labelBottom ?? activeTheme.button.labelBottom;
    const iconGap = p.theme?.button.iconGap ?? activeTheme.button.iconGap;
    const sizeMode = skin?.sizeMode === 'simple' ? 'simple' : 'sliced';
    const outlineWidth = skin?.outlineWidth ?? 2;
    return (
        <view name="ActionButton" interaction="press" interactable={!p.disabled}
            onClick={() => { if (!p.disabled) p.onClick?.(); }}
            style={{ width: width, height: height, opacity: p.disabled ? 0.5 : 1 }}>
            <image name="ActionButton/Background" source={source}
                style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: sizeMode }} />
            <text name="ActionButton/Label" visible={!hasIcon} value={p.label}
                style={{ position: 'absolute', left: labelLeft, right: labelRight, top: labelTop, bottom: labelBottom,
                    font: font, fontSize: fontSize, color: labelColor,
                    outlineColor: outlineColor, outlineWidth: outlineWidth,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <view name="ActionButton/IconRow" visible={hasIcon}
                style={{ position: 'absolute', left: labelLeft, right: labelRight, top: labelTop, bottom: labelBottom,
                    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: iconGap }}>
                <image name="ActionButton/Icon" source={p.icon ?? source}
                    style={{ width: iconWidth, height: iconHeight }} />
                <text name="ActionButton/IconLabel" value={p.label}
                    style={{ width: iconLabelWidth, height: '100%',
                        font: font, fontSize: fontSize, color: labelColor,
                        outlineColor: outlineColor, outlineWidth: outlineWidth,
                        horizontalAlign: 'left', verticalAlign: 'center', overflow: 'shrink' }} />
            </view>
        </view>
    );
});
