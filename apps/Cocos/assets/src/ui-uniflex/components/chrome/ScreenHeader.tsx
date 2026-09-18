import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface ScreenHeaderProps {
    readonly title: string;
    readonly top?: number;
    readonly titleLeft?: number;
    readonly titleTop?: number;
    readonly titleWidth?: number;
    readonly titleHeight?: number;
}

const HEADER_WIDTH = 750;
const HEADER_HEIGHT = 90;
const DEFAULT_TITLE_LEFT = 38;
const DEFAULT_TITLE_WIDTH = 200;
const DEFAULT_TITLE_HEIGHT = 58;
const DEFAULT_TITLE_INSET = 16;

/** Mail header + outlined title. `titleLeft`/`titleTop` are page-absolute so assembled values paste through. */
export const ScreenHeader = defineComponent<ScreenHeaderProps>((p) => {
    const title = p.title;
    const top = p.top ?? 0;
    const titleLeft = p.titleLeft ?? DEFAULT_TITLE_LEFT;
    const titleTop = p.titleTop ?? (top + DEFAULT_TITLE_INSET);
    const titleWidth = p.titleWidth ?? DEFAULT_TITLE_WIDTH;
    const titleHeight = p.titleHeight ?? DEFAULT_TITLE_HEIGHT;
    const labelTop = titleTop - top;
    const header = imageRef('ui/mail/header');
    const font = fontRef('fonts/regular', 700);
    return (
        <view name="ScreenHeader" style={{ position: 'absolute', left: 0, top: top, width: HEADER_WIDTH, height: HEADER_HEIGHT }}>
            <image source={header}
                style={{ position: 'absolute', left: 0, top: 0, width: HEADER_WIDTH, height: HEADER_HEIGHT, sizeMode: 'sliced' }} />
            <text value={title}
                style={{ position: 'absolute', left: titleLeft, top: labelTop, width: titleWidth, height: titleHeight,
                    font: font, fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />
        </view>
    );
});
