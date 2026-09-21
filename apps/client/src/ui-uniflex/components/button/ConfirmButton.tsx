import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { ActionButton } from './ActionButton';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface ConfirmButtonProps {
    readonly theme?: ComponentTheme;
    readonly label?: string;
    readonly onClick?: () => void;
    readonly width?: number;
    readonly height?: number;
    readonly disabled?: boolean;
    readonly labelColor?: string;
    readonly source?: ImageRef;
    readonly icon?: ImageRef;
    readonly iconWidth?: number;
    readonly iconHeight?: number;
}
/** Confirm role uses the active theme's yellow skin. */
export const ConfirmButton = defineComponent<ConfirmButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const label = p.label ?? '确定';
    const source = p.source ?? theme.button.confirm.image;
    const outlineColor = theme.button.confirm.outline;
    const disabled = p.disabled;
    const labelColor = p.labelColor;
    const onClick = p.onClick;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    const width = p.width ?? p.theme?.button.width ?? activeTheme.button.width;
    const height = p.height ?? p.theme?.button.height ?? activeTheme.button.height;
    return (
        <view name="ConfirmButton" style={{ width: width, height: height }}>
            <ActionButton label={label} source={source} outlineColor={outlineColor} theme={theme}
                width={width} height={height} disabled={disabled} onClick={onClick}
                labelColor={labelColor}
                icon={icon} iconWidth={iconWidth} iconHeight={iconHeight} />
        </view>
    );
});
