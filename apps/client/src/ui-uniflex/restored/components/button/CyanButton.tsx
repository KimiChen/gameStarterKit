import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from './ActionButton';
import type { ConfirmButtonProps } from './ConfirmButton';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

/** Cyan action skin used by alliance war / territory flag buttons. */
export const CyanButton = defineComponent<ConfirmButtonProps>((p) => {
    const label = p.label ?? '';
    const source = imageRef('ui/button/cyan');
    const outlineColor = '#2e5a68';
    const width = p.width;
    const height = p.height;
    const disabled = p.disabled;
    const onClick = p.onClick;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    return <ActionButton label={label} source={source} outlineColor={outlineColor}
        width={width} height={height} disabled={disabled} onClick={onClick}
        icon={icon} iconWidth={iconWidth} iconHeight={iconHeight} />;
});
