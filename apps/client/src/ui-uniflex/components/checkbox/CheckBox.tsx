import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface CheckBoxProps {
    readonly theme?: ComponentTheme;
    readonly checked: boolean;
    readonly checkedSource?: ImageRef;
    readonly uncheckedSource?: ImageRef;
    readonly size?: number;
    readonly hitSize?: number;
}

/** Shared check skin in a larger hit target; callers inject on/off images and handle clicks. */
export const CheckBox = defineComponent<CheckBoxProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const checkedSource = p.checkedSource ?? theme.checkbox.on;
    const uncheckedSource = p.uncheckedSource ?? theme.checkbox.off;
    const size = p.size ?? p.theme?.checkbox.size ?? activeTheme.checkbox.size;
    const hit = p.hitSize ?? p.theme?.checkbox.hitSize ?? activeTheme.checkbox.hitSize;
    const inset = (hit - size) / 2;
    return (
        <view name="CheckBox" style={{ width: hit, height: hit }}>
            <image visible={p.checked} source={checkedSource}
                style={{ position: 'absolute', left: inset, top: inset, width: size, height: size }} />
            <image visible={!p.checked} source={uncheckedSource}
                style={{ position: 'absolute', left: inset, top: inset, width: size, height: size }} />
        </view>
    );
});
