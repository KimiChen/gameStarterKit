import { defineComponent, ScopedSlot } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { ActionButton } from '../button/ActionButton';
import { backButton } from '../button/buttonSkins';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface ScreenFooterProps {
    readonly theme?: ComponentTheme;
    readonly source?: ImageRef;
    readonly backSource?: ImageRef;
    readonly backLeft?: number;
    readonly onBack?: () => void;
    /** Optional footer content, positioned relative to the footer's top-left corner. */
    readonly children?: () => unknown;
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
    const backWidth = p.theme?.chrome.backWidth ?? activeTheme.chrome.backWidth;
    const backHeight = p.theme?.chrome.backHeight ?? activeTheme.chrome.backHeight;
    const onBack = p.onBack;
    const backSource = p.backSource;
    return (
        <view name="ScreenFooter" style={{ position: 'absolute', left: 0, bottom: 0, width: footerWidth, height: footerHeight }}>
            <image source={source}
                style={{ position: 'absolute', left: 0, top: 0, width: footerWidth, height: footerHeight, sizeMode: 'sliced' }} />
            <ActionButton skin={backButton} source={backSource} left={backLeft} top={backTop}
                width={backWidth} height={backHeight} accessibilityLabel="返回" onClick={onBack} />
            <ScopedSlot args={[]}>
                <view visible={false} />
            </ScopedSlot>
        </view>
    );
});
