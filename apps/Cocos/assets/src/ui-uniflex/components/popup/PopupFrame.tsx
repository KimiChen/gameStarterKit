import { defineComponent, Slot } from '@uniflex/compiler';
import { fontRef } from '../../../kits/uniflex/api/core/index';
import { PopupBackground } from './PopupBackground';
import { CloseButton } from './CloseButton';

export interface PopupFrameProps {
    readonly title: string;
    readonly kind?: 'prompt' | 'small' | 'settings' | 'profile';
    readonly width?: number;
    readonly height?: number;
    readonly titleColor?: string;
    readonly titleOutline?: string;
    readonly titleOutlineWidth?: number;
    readonly titleFontSize?: number;
    readonly onClose?: () => void;
    readonly children?: unknown;
}

/** Shared modal frame; the caller supplies one content root through Slot. */
export const PopupFrame = defineComponent<PopupFrameProps>((p) => (
    <view name="PopupFrame" style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <view name="PopupFrame/Mask" interaction="press"
            style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#00000099' }} />
        <view name="PopupFrame/Panel" style={{ width: p.width ?? 708, height: p.height ?? 510 }}>
            <PopupBackground kind={p.kind} />
            <text name="PopupFrame/Title" value={p.title}
                style={{ position: 'absolute', left: p.kind === 'settings' || p.kind === 'profile' ? 120 : 90,
                    right: p.kind === 'settings' || p.kind === 'profile' ? 120 : 90,
                    top: p.kind === 'settings' || p.kind === 'profile' ? 11 : 18,
                    height: p.kind === 'settings' || p.kind === 'profile' ? 64 : 58,
                    font: fontRef('fonts/regular', 400), fontSize: p.titleFontSize ?? 40, bold: true,
                    color: p.titleColor ?? '#ffffff', outlineColor: p.titleOutline ?? '#593d84',
                    outlineWidth: p.titleOutlineWidth ?? 2, horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <view name="PopupFrame/Content"
                style={{ position: 'absolute', left: p.kind === 'settings' || p.kind === 'profile' ? 0 : 40,
                    right: p.kind === 'settings' || p.kind === 'profile' ? 0 : 40,
                    top: p.kind === 'settings' || p.kind === 'profile' ? 0 : 108,
                    bottom: p.kind === 'settings' || p.kind === 'profile' ? 0 : 38 }}>
                <Slot />
            </view>
            <CloseButton onClick={p.onClose} />
        </view>
    </view>
));
