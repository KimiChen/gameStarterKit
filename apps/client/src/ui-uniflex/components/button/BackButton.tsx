import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface BackButtonProps {
    readonly theme?: ComponentTheme;
    readonly top: number;
    readonly left?: number;
    readonly source?: ImageRef;
    readonly onClick?: () => void;
}

/** Footer back arrow. `left`/`top` are page-absolute so assembled values paste through. */
export const BackButton = defineComponent<BackButtonProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const left = p.left ?? p.theme?.chrome.backLeft ?? activeTheme.chrome.backLeft;
    const top = p.top;
    const width = p.theme?.chrome.backWidth ?? activeTheme.chrome.backWidth;
    const height = p.theme?.chrome.backHeight ?? activeTheme.chrome.backHeight;
    const icon = p.source ?? theme.chrome.back;
    return (
        <view name="BackButton" interaction="press" accessibilityLabel="返回" onClick={() => p.onClick?.()}
            style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
            <image source={icon} style={{ width: width, height: height }} />
        </view>
    );
});
