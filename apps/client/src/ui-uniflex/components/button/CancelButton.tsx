import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from './ActionButton';
import type { ConfirmButtonProps } from './ConfirmButton';
import { imageRef } from '../../../kits/uniflex/api/core/index';

/** Cancel role uses the active theme's green skin. */
export const CancelButton = defineComponent<ConfirmButtonProps>((p) => {
    const label = p.label ?? '取消';
    const source = imageRef('ui/button/cancel');
    const outlineColor = '#4e783b';
    const width = p.width;
    const height = p.height;
    const disabled = p.disabled;
    const onClick = p.onClick;
    return <ActionButton label={label} source={source} outlineColor={outlineColor}
        width={width} height={height} disabled={disabled} onClick={onClick} />;
});
