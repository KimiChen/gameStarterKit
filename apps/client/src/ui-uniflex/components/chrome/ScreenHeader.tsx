import { defineComponent } from '@uniflex/compiler';
import { theme as activeTheme, type ComponentTheme } from '../../themes/active';

export interface ScreenHeaderProps {
    readonly theme?: ComponentTheme;
    readonly title: string;
    readonly top?: number;
    readonly titleLeft?: number;
    readonly titleTop?: number;
    readonly titleWidth?: number;
    readonly titleHeight?: number;
    readonly titleColor?: string;
    readonly titleOutline?: string;
}

/** Mail header + outlined title. `titleLeft`/`titleTop` are page-absolute so assembled values paste through. */
export const ScreenHeader = defineComponent<ScreenHeaderProps>((p) => {
    const theme = p.theme ?? activeTheme;
    const title = p.title;
    const top = p.top ?? 0;
    const headerWidth = p.theme?.chrome.headerWidth ?? activeTheme.chrome.headerWidth;
    const headerHeight = p.theme?.chrome.headerHeight ?? activeTheme.chrome.headerHeight;
    const titleLeft = p.titleLeft ?? p.theme?.chrome.titleLeft ?? activeTheme.chrome.titleLeft;
    const titleInset = p.theme?.chrome.titleInset ?? activeTheme.chrome.titleInset;
    const titleTop = p.titleTop ?? (top + titleInset);
    const titleWidth = p.titleWidth ?? p.theme?.chrome.titleWidth ?? activeTheme.chrome.titleWidth;
    const titleHeight = p.titleHeight ?? p.theme?.chrome.titleHeight ?? activeTheme.chrome.titleHeight;
    const titleSize = p.theme?.chrome.titleSize ?? activeTheme.chrome.titleSize;
    const titleAlign = p.theme?.chrome.titleAlign ?? activeTheme.chrome.titleAlign;
    const titleOutlineWidth = p.theme?.chrome.titleOutlineWidth ?? activeTheme.chrome.titleOutlineWidth;
    const labelTop = titleTop - top;
    const header = theme.chrome.header;
    const font = theme.chrome.font;
    const titleColor = p.titleColor ?? theme.chrome.title;
    const titleOutline = p.titleOutline ?? theme.chrome.outline;
    return (
        <view name="ScreenHeader" style={{ position: 'absolute', left: 0, top: top, width: headerWidth, height: headerHeight }}>
            <image source={header}
                style={{ position: 'absolute', left: 0, top: 0, width: headerWidth, height: headerHeight, sizeMode: 'sliced' }} />
            <text value={title}
                style={{ position: 'absolute', left: titleLeft, top: labelTop, width: titleWidth, height: titleHeight,
                    font: font, fontSize: titleSize, color: titleColor, bold: true,
                    outlineColor: titleOutline, outlineWidth: titleOutlineWidth,
                    horizontalAlign: titleAlign, verticalAlign: 'center' }} />
        </view>
    );
});
