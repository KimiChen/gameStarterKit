import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../../kits/uniflex/api/core/index';

export interface CheckBoxProps {
    readonly checked: boolean;
    readonly checkedSource: ImageRef;
    readonly uncheckedSource: ImageRef;
    readonly size?: number;
    readonly hitSize?: number;
}

/** Shared check skin in a larger hit target; callers inject on/off images and handle clicks. */
export const CheckBox = defineComponent<CheckBoxProps>((p) => {
    const size = p.size ?? 44;
    const hit = p.hitSize ?? 52;
    const inset = (hit - size) / 2;
    return (
        <view name="CheckBox" style={{ width: hit, height: hit }}>
            <image visible={p.checked} source={p.checkedSource}
                style={{ position: 'absolute', left: inset, top: inset, width: size, height: size }} />
            <image visible={!p.checked} source={p.uncheckedSource}
                style={{ position: 'absolute', left: inset, top: inset, width: size, height: size }} />
        </view>
    );
});
