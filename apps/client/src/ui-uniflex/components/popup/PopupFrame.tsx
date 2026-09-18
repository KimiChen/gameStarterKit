import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { CloseButton } from './CloseButton';

export interface PopupFrameProps {
    readonly title: string;
    readonly left: number;
    readonly top: number;
    readonly width?: number;
    readonly height?: number;
    readonly onClose?: () => void;
}

const DEFAULT_WIDTH = 708;
const DEFAULT_HEIGHT = 510;
const TITLE_PAD = 90;
const TITLE_TOP = 18;
const TITLE_HEIGHT = 58;
const TITLE_COLOR = '#ffffff';
const TITLE_OUTLINE = '#593d84';

/** Mask + chrome + close. `left`/`top` are page-absolute so assembled window values paste through. */
export const PopupFrame = defineComponent<PopupFrameProps>((p) => {
    const title = p.title;
    const width = p.width ?? DEFAULT_WIDTH;
    const height = p.height ?? DEFAULT_HEIGHT;
    const left = p.left;
    const top = p.top;
    const onClose = p.onClose;
    const font = fontRef('fonts/regular', 400);
    const background = imageRef('ui/popup/prompt');
    return (
        <view name="PopupFrame" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
            <view name="PopupFrame/Mask" interaction="press"
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#00000099' }} />
            <view name="PopupFrame/Panel" style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
                <image name="PopupFrame/Background" source={background}
                    style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text name="PopupFrame/Title" value={title}
                    style={{ position: 'absolute', left: TITLE_PAD, right: TITLE_PAD, top: TITLE_TOP, height: TITLE_HEIGHT,
                        font: font, fontSize: 40, bold: true,
                        color: TITLE_COLOR, outlineColor: TITLE_OUTLINE,
                        outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
                <CloseButton onClick={onClose} />
            </view>
        </view>
    );
});
