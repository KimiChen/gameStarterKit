import { defineComponent } from '@uniflex/compiler';
import type { FontRef, ImageRef } from '../../../kits/uniflex/api/core/index';
import { ActionButton } from '../button/ActionButton';
import { closeButton } from '../button/buttonSkins';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface PopupFrameProps {
    readonly theme?: ComponentTheme;
    readonly title: string;
    readonly background?: ImageRef;
    readonly left: number;
    readonly top: number;
    readonly width?: number;
    readonly height?: number;
    readonly onClose?: () => void;
    readonly titleFont?: FontRef;
    readonly titleColor?: string;
    readonly titleOutline?: string;
    readonly titleOutlineWidth?: number;
    readonly titleLeft?: number;
    readonly titleRight?: number;
    readonly titleTop?: number;
    readonly titleHeight?: number;
    readonly maskColor?: string;
    readonly closeSource?: ImageRef;
    readonly closeRight?: number;
    readonly closeTop?: number;
    readonly closeHit?: number;
    readonly closeIcon?: number;
}

/** Mask + chrome + close. `left`/`top` are page-absolute so assembled window values paste through. */
export const PopupFrame = defineComponent<PopupFrameProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const title = p.title;
    const width = p.width ?? p.theme?.popup.width ?? activeTheme.popup.width;
    const height = p.height ?? p.theme?.popup.height ?? activeTheme.popup.height;
    const left = p.left;
    const top = p.top;
    const onClose = p.onClose;
    const font = p.titleFont ?? theme.popup.font;
    const background = p.background ?? theme.popup.prompt;
    // UniFlex AOT inlines `theme.popup.titleLeft` to classic's number; `p.theme?.popup.*` stays a runtime read.
    const titleLeft = p.titleLeft ?? p.theme?.popup.titleLeft ?? activeTheme.popup.titleLeft;
    const titleRight = p.titleRight ?? p.theme?.popup.titleRight ?? activeTheme.popup.titleRight;
    const titleTop = p.titleTop ?? p.theme?.popup.titleTop ?? activeTheme.popup.titleTop;
    const titleHeight = p.titleHeight ?? p.theme?.popup.titleHeight ?? activeTheme.popup.titleHeight;
    const titleSize = p.theme?.popup.titleSize ?? activeTheme.popup.titleSize;
    const titleAlign = p.theme?.popup.titleAlign ?? activeTheme.popup.titleAlign;
    const titleOutlineWidth = p.titleOutlineWidth ?? p.theme?.popup.titleOutlineWidth ?? activeTheme.popup.titleOutlineWidth;
    const titleColor = p.titleColor ?? theme.popup.title;
    const titleOutline = p.titleOutline ?? theme.popup.outline;
    const maskColor = p.maskColor ?? theme.popup.mask;
    const closeRight = p.closeRight ?? p.theme?.popup.closeRight ?? activeTheme.popup.closeRight;
    const closeTop = p.closeTop ?? p.theme?.popup.closeTop ?? activeTheme.popup.closeTop;
    const closeHit = p.closeHit ?? p.theme?.popup.closeHit ?? activeTheme.popup.closeHit;
    const closeIcon = p.closeIcon ?? p.theme?.popup.closeIcon ?? activeTheme.popup.closeIcon;
    const closeInset = (closeHit - closeIcon) / 2;
    return (
        <view name="PopupFrame" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
            <view name="PopupFrame/Mask" interaction="press"
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: maskColor }} />
            <view name="PopupFrame/Panel" style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
                <image name="PopupFrame/Background" source={background}
                    style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text name="PopupFrame/Title" value={title}
                    style={{ position: 'absolute', left: titleLeft, right: titleRight, top: titleTop, height: titleHeight,
                        font: font, fontSize: titleSize, bold: true,
                        color: titleColor, outlineColor: titleOutline,
                        outlineWidth: titleOutlineWidth, horizontalAlign: titleAlign, verticalAlign: 'center', overflow: 'shrink' }} />
                <ActionButton skin={closeButton} source={p.closeSource} right={closeRight} top={closeTop}
                    width={closeHit} height={closeHit} imageInset={closeInset} onClick={onClose} />
            </view>
        </view>
    );
});
