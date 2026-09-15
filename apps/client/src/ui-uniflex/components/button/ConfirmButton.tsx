import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from './ActionButton';
import { imageRef } from '../../../kits/uniflex/api/core/index';

export interface ConfirmButtonProps {
    readonly label?: string;
    readonly onClick?: () => void;
    readonly width?: number;
    readonly height?: number;
    readonly disabled?: boolean;
}
/** Confirm role uses the active theme's yellow skin. */
export const ConfirmButton = defineComponent<ConfirmButtonProps>((p) => {
    const label = p.label ?? '确定';
    const source = imageRef('ui/button/confirm');
    const outlineColor = '#643e14';
    const disabled = p.disabled;
    const onClick = p.onClick;
    return (
        <view name="ConfirmButton" style={{ width: p.width ?? 255, height: p.height ?? 102 }}>
            <ActionButton label={label} source={source} outlineColor={outlineColor}
                width={p.width} height={p.height} disabled={disabled} onClick={onClick} />
        </view>
    );
});
