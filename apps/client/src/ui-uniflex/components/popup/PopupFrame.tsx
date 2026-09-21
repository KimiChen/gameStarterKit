import { defineComponent } from '@uniflex/compiler';
import { CloseButton } from '../button/CloseButton';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface PopupFrameProps {
    readonly theme?: ComponentTheme;
    readonly title: string;
    readonly left: number;
    readonly top: number;
    readonly width?: number;
    readonly height?: number;
    readonly onClose?: () => void;
    readonly titleColor?: string;
    readonly titleOutline?: string;
    readonly maskColor?: string;
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
    const font = theme.popup.font;
    const background = theme.popup.prompt;
    // UniFlex AOT inlines `theme.popup.titleLeft` to classic's number; `p.theme?.popup.*` stays a runtime read.
    const titleLeft = p.theme?.popup.titleLeft ?? activeTheme.popup.titleLeft;
    const titleRight = p.theme?.popup.titleRight ?? activeTheme.popup.titleRight;
    const titleTop = p.theme?.popup.titleTop ?? activeTheme.popup.titleTop;
    const titleHeight = p.theme?.popup.titleHeight ?? activeTheme.popup.titleHeight;
    const titleSize = p.theme?.popup.titleSize ?? activeTheme.popup.titleSize;
    const titleAlign = p.theme?.popup.titleAlign ?? activeTheme.popup.titleAlign;
    const titleOutlineWidth = p.theme?.popup.titleOutlineWidth ?? activeTheme.popup.titleOutlineWidth;
    const titleColor = p.titleColor ?? theme.popup.title;
    const titleOutline = p.titleOutline ?? theme.popup.outline;
    const maskColor = p.maskColor ?? theme.popup.mask;
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
                <CloseButton theme={theme} onClick={onClose} />
            </view>
        </view>
    );
});
