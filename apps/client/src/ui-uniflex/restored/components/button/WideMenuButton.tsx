import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../../themes/active';

export interface WideMenuButtonProps {
    readonly theme?: ComponentTheme;
    readonly background?: ImageRef;
    readonly icon: ImageRef;
    readonly iconWidth: number;
    readonly iconHeight: number;
    readonly label: string;
    readonly left: number;
    readonly top: number;
    readonly onClick?: () => void;
    readonly labelLeft?: number;
    readonly labelTop?: number;
    readonly labelWidth?: number;
    readonly labelHeight?: number;
    readonly color?: string;
}

/** Wide icon+label row. Callers inject the skin and icon. */
export const WideMenuButton = defineComponent<WideMenuButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const background = p.background ?? theme.wideMenu.background;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    const label = p.label;
    const left = p.left;
    const top = p.top;
    const onClick = p.onClick;
    const width = p.theme?.wideMenu.width ?? activeTheme.wideMenu.width;
    const height = p.theme?.wideMenu.height ?? activeTheme.wideMenu.height;
    const iconCenterX = p.theme?.wideMenu.iconCenterX ?? activeTheme.wideMenu.iconCenterX;
    const iconLeft = iconCenterX - iconWidth / 2;
    const iconTop = (height - iconHeight) / 2;
    const labelLeft = p.labelLeft ?? p.theme?.wideMenu.labelLeft ?? activeTheme.wideMenu.labelLeft;
    const labelTop = p.labelTop ?? p.theme?.wideMenu.labelTop ?? activeTheme.wideMenu.labelTop;
    const labelWidth = p.labelWidth ?? p.theme?.wideMenu.labelWidth ?? activeTheme.wideMenu.labelWidth;
    const labelHeight = p.labelHeight ?? p.theme?.wideMenu.labelHeight ?? activeTheme.wideMenu.labelHeight;
    const labelAlign = p.theme?.wideMenu.labelAlign ?? activeTheme.wideMenu.labelAlign;
    const fontSize = p.theme?.wideMenu.fontSize ?? activeTheme.wideMenu.fontSize;
    const font = theme.wideMenu.font;
    const color = p.color ?? theme.wideMenu.color;
    return (
        <view name="WideMenuButton" interaction="press" onClick={() => onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={background}
                style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, sizeMode: 'sliced' }} />
            <image source={icon}
                style={{ position: 'absolute', left: iconLeft, top: iconTop, width: iconWidth, height: iconHeight }} />
            <text value={label}
                style={{ position: 'absolute', left: labelLeft, top: labelTop, width: labelWidth, height: labelHeight,
                    font: font, fontSize: fontSize, color: color, bold: true,
                    horizontalAlign: labelAlign, verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
