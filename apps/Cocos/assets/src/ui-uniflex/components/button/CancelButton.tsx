import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from './ActionButton';
import type { ConfirmButtonProps } from './ConfirmButton';
import { theme as activeTheme } from '../../themes/active';

/** Cancel role uses the active theme's green skin. */
export const CancelButton = defineComponent<ConfirmButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const label = p.label ?? '取消';
    const source = p.source ?? theme.button.cancel.image;
    const outlineColor = theme.button.cancel.outline;
    const disabled = p.disabled;
    const labelColor = p.labelColor;
    const onClick = p.onClick;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    const width = p.width ?? p.theme?.button.width ?? activeTheme.button.width;
    const height = p.height ?? p.theme?.button.height ?? activeTheme.button.height;
    return (
        <view name="CancelButton" style={{ width: width, height: height }}>
            <ActionButton label={label} source={source} outlineColor={outlineColor} theme={theme}
                width={width} height={height} disabled={disabled} onClick={onClick}
                labelColor={labelColor}
                icon={icon} iconWidth={iconWidth} iconHeight={iconHeight} />
        </view>
    );
});
