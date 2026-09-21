import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { BackButton } from '../button/BackButton';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface ScreenFooterProps {
    readonly theme?: ComponentTheme;
    readonly source?: ImageRef;
    readonly backSource?: ImageRef;
    readonly backLeft?: number;
    readonly onBack?: () => void;
}

/** Classic assembled footer height; pages that pin scroll to the bar keep this export. */
export const SCREEN_FOOTER_HEIGHT = 110;

/** Footer bar + back arrow, pinned to the parent bottom. */
export const ScreenFooter = defineComponent<ScreenFooterProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const source = p.source ?? theme.chrome.footer;
    const footerWidth = p.theme?.chrome.footerWidth ?? activeTheme.chrome.footerWidth;
    const footerHeight = p.theme?.chrome.footerHeight ?? activeTheme.chrome.footerHeight;
    const backLeft = p.backLeft ?? p.theme?.chrome.backLeft ?? activeTheme.chrome.backLeft;
    const backTop = p.theme?.chrome.backTop ?? activeTheme.chrome.backTop;
    const onBack = p.onBack;
    const backSource = p.backSource;
    return (
        <view name="ScreenFooter" style={{ position: 'absolute', left: 0, bottom: 0, width: footerWidth, height: footerHeight }}>
            <image source={source}
                style={{ position: 'absolute', left: 0, top: 0, width: footerWidth, height: footerHeight, sizeMode: 'sliced' }} />
            <BackButton theme={theme} left={backLeft} top={backTop} source={backSource} onClick={onBack} />
        </view>
    );
});
