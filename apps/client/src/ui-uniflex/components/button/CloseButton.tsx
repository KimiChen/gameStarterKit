import { defineComponent } from '@uniflex/compiler';
import type { ImageRef } from '../../../kits/uniflex/api/core/index';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface CloseButtonProps {
    readonly onClick?: () => void;
    readonly source?: ImageRef;
    readonly theme?: ComponentTheme;
}

/** Hit target around the close icon, anchored to the popup's top-right from the theme layout. */
export const CloseButton = defineComponent<CloseButtonProps>((p) => {
    // Same AOT constraint as PopupFrame: numbers on a local `theme.popup` get inlined to classic.
    const closeRight = p.theme?.popup.closeRight ?? activeTheme.popup.closeRight;
    const closeTop = p.theme?.popup.closeTop ?? activeTheme.popup.closeTop;
    const closeHit = p.theme?.popup.closeHit ?? activeTheme.popup.closeHit;
    const closeIcon = p.theme?.popup.closeIcon ?? activeTheme.popup.closeIcon;
    const closeIconInset = (closeHit - closeIcon) / 2;
    const source = p.source ?? (p.theme ?? activeTheme).popup.close;
    return (<view name="CloseButton" interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', right: closeRight, top: closeTop, width: closeHit, height: closeHit }}>
        <image source={source}
            style={{ position: 'absolute', left: closeIconInset, top: closeIconInset, width: closeIcon, height: closeIcon }} />
    </view>);
});
