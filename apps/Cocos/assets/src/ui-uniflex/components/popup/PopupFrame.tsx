import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { CloseButton } from './CloseButton';

export interface PopupFrameProps {
    readonly title: string;
    readonly kind?: 'prompt' | 'small' | 'settings' | 'profile';
    readonly width?: number;
    readonly height?: number;
    readonly left?: number;
    readonly top?: number;
    readonly visible?: boolean;
    readonly titleColor?: string;
    readonly titleOutline?: string;
    readonly onClose?: () => void;
}

const DEFAULT_WIDTH = 708;
const DEFAULT_HEIGHT = 510;
const WIDE_TITLE_PAD = 120;
const TITLE_PAD = 90;
const WIDE_TITLE_TOP = 11;
const TITLE_TOP = 18;
const WIDE_TITLE_HEIGHT = 64;
const TITLE_HEIGHT = 58;

/** Mask + chrome + close. `left`/`top` are page-absolute so assembled window values paste through. */
export const PopupFrame = defineComponent<PopupFrameProps>((p) => {
    const title = p.title;
    const kind = p.kind;
    const width = p.width ?? DEFAULT_WIDTH;
    const height = p.height ?? DEFAULT_HEIGHT;
    const pinLeft = p.left;
    const pinTop = p.top;
    const pinned = pinLeft != null && pinTop != null;
    const panelLeft = pinLeft ?? 0;
    const panelTop = pinTop ?? 0;
    const visible = p.visible !== false;
    const titleColor = p.titleColor ?? '#ffffff';
    const titleOutline = p.titleOutline ?? '#593d84';
    const onClose = p.onClose;
    const wide = kind === 'settings' || kind === 'profile';
    const titlePad = wide ? WIDE_TITLE_PAD : TITLE_PAD;
    const titleTop = wide ? WIDE_TITLE_TOP : TITLE_TOP;
    const titleHeight = wide ? WIDE_TITLE_HEIGHT : TITLE_HEIGHT;
    const font = fontRef('fonts/regular', 400);
    const background = imageRef('ui/popup/prompt');
    const rootStyle = pinned
        ? { position: 'absolute' as const, left: 0, top: 0, width: '100%' as const, height: '100%' as const }
        : { width: '100%' as const, height: '100%' as const, justifyContent: 'center' as const, alignItems: 'center' as const };
    const panelStyle = pinned
        ? { position: 'absolute' as const, left: panelLeft, top: panelTop, width: width, height: height }
        : { width: width, height: height };
    return (
        <view name="PopupFrame" visible={visible} style={rootStyle}>
            <view name="PopupFrame/Mask" interaction="press"
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#00000099' }} />
            <view name="PopupFrame/Panel" style={panelStyle}>
                <image name="PopupFrame/Background" source={background}
                    style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
                <text name="PopupFrame/Title" value={title}
                    style={{ position: 'absolute', left: titlePad, right: titlePad, top: titleTop, height: titleHeight,
                        font: font, fontSize: 40, bold: true,
                        color: titleColor, outlineColor: titleOutline,
                        outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
                <view name="PopupFrame/Content"
                    style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} />
                <CloseButton onClick={onClose} />
            </view>
        </view>
    );
});
