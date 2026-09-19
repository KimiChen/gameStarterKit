import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from './ActionButton';
import type { ConfirmButtonProps } from './ConfirmButton';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

/** Cancel role uses the active theme's green skin. */
export const CancelButton = defineComponent<ConfirmButtonProps>((p) => {
    const label = p.label ?? '取消';
    const source = imageRef('ui/button/cancel');
    const outlineColor = '#4e783b';
    const disabled = p.disabled;
    const onClick = p.onClick;
    const icon = p.icon;
    const iconWidth = p.iconWidth;
    const iconHeight = p.iconHeight;
    return (
        <view name="CancelButton" style={{ width: p.width ?? 255, height: p.height ?? 102 }}>
            <ActionButton label={label} source={source} outlineColor={outlineColor}
                width={p.width} height={p.height} disabled={disabled} onClick={onClick}
                icon={icon} iconWidth={iconWidth} iconHeight={iconHeight} />
        </view>
    );
});
