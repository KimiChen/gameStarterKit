import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from './ActionButton';
import type { ConfirmButtonProps } from './ConfirmButton';
import { theme as activeTheme } from '../../themes/active';

/** Cyan action skin used by alliance war / territory flag buttons. */
export const CyanButton = defineComponent<ConfirmButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const label = p.label ?? '';
    const source = theme.button.cyan.image;
    const outlineColor = theme.button.cyan.outline;
    const width = p.width;
    const height = p.height;
    const disabled = p.disabled;
    const labelColor = p.labelColor;
    const onClick = p.onClick;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    return <ActionButton theme={theme} label={label} source={source} outlineColor={outlineColor}
        width={width} height={height} disabled={disabled} onClick={onClick}
        labelColor={labelColor}
        icon={icon} iconWidth={iconWidth} iconHeight={iconHeight} />;
});
