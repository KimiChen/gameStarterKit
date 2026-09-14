import { defineView } from '@uniflex/compiler';
import { imageRef, fontRef } from '../../../kits/uniflex/api/core/index';

export interface PromptTheme {
    readonly titleColor: string;
    readonly titleOutline: string;
    readonly messageColor: string;
    readonly confirmOutline: string;
    readonly cancelOutline: string;
}

export interface PromptParams {
    readonly title?: string;
    readonly message: string;
    readonly confirmText?: string;
    readonly cancelText?: string | null;
    readonly theme: PromptTheme;
    readonly onConfirm: () => void;
    readonly onCancel?: () => void;
    readonly onClose?: () => void;
}

/** Reusable prompt surface. Layout stays stable while all skin values are injected as theme data. */
export const Prompt = defineView<PromptParams, void>({ zIndex: 'window' }, (context) => {
    const p = context.params;
    const hasCancel = p.cancelText !== null;
    return <view name="Prompt" style={{ width: 750, height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <view name="Prompt/Mask" interaction="press" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', backgroundColor: '#00000099' }} />
        <view name="Prompt/Panel" style={{ width: 708, height: 375, position: 'relative' }}>
            <image name="Prompt/Background" style={{ position: 'absolute', left: 0, top: 0, width: 708, height: 375 }} source={imageRef('prompt/popup')} />
            <text name="Prompt/Title" value={p.title ?? '提示'} style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58, font: fontRef('fonts/regular', 700), fontSize: 40, color: p.theme.titleColor, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view name="Prompt/Close" interaction="press" onClick={() => p.onClose?.()} style={{ position: 'absolute', left: 621, top: 6, width: 72, height: 72 }}>
                <image style={{ position: 'absolute', left: 11, top: 11, width: 50, height: 50 }} source={imageRef('prompt/close')} />
            </view>
            <text name="Prompt/Message" value={p.message} style={{ position: 'absolute', left: 40, top: 132, width: 628, height: 48, font: fontRef('fonts/regular', 700), fontSize: 28, color: p.theme.messageColor, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view name="Prompt/ConfirmButton" interaction="press" onClick={() => p.onConfirm()} style={{ position: 'absolute', left: 55, top: 233, width: 257, height: 110 }}>
                <image style={{ position: 'absolute', left: 0, top: 0, width: 255, height: 102 }} source={imageRef('prompt/confirm')} />
                <text value={p.confirmText ?? '确定'} style={{ position: 'absolute', left: 0, top: 13, width: 255, height: 70, font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view visible={hasCancel} name="Prompt/CancelButton" interaction="press" onClick={() => p.onCancel?.()} style={{ position: 'absolute', left: 397, top: 233, width: 257, height: 110 }}>
                <image style={{ position: 'absolute', left: 0, top: 0, width: 255, height: 102 }} source={imageRef('prompt/cancel')} />
                <text value={p.cancelText ?? '取消'} style={{ position: 'absolute', left: 0, top: 13, width: 255, height: 70, font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
        </view>
    </view>;
});
