import { defineView } from '@uniflex/compiler';
import { PopupFrame } from '../../components/popup/PopupFrame';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CancelButton } from '../../components/button/CancelButton';
import { theme } from '../../themes/active';

/** Optional presentation overrides; normal pages use the shared active theme. */
export interface PromptTheme {
    readonly titleColor?: string;
    readonly titleOutline?: string;
    readonly messageColor?: string;
}
export interface PromptParams {
    readonly title?: string;
    readonly message: string;
    readonly confirmText?: string;
    readonly cancelText?: string | null;
    readonly theme?: PromptTheme;
    readonly onConfirm: () => void;
    readonly onCancel?: () => void;
    readonly onClose?: () => void;
}

export const Prompt = defineView<PromptParams, void>({ zIndex: 'window' }, (context) => {
    const p = context.params;
    return <PopupFrame title={p.title ?? '提示'} kind="prompt" height={375}
        titleColor={p.theme?.titleColor} titleOutline={p.theme?.titleOutline} onClose={p.onClose}>
        <view name="Prompt/Content" style={{ width: '100%', height: '100%' }}>
            <text name="Prompt/Message" value={p.message}
                style={{ width: '100%', height: 104, font: theme.font, fontSize: 28,
                    color: p.theme?.messageColor ?? theme.text,
                    horizontalAlign: 'center', verticalAlign: 'center', wrap: true, overflow: 'shrink' }} />
            <view name="Prompt/Actions" style={{ position: 'absolute', bottom: 0, width: '100%',
                flexDirection: 'row', justifyContent: 'center', gap: 87 }}>
                <ConfirmButton label={p.confirmText} onClick={p.onConfirm} />
                <view visible={p.cancelText !== null}>
                    <CancelButton label={p.cancelText ?? '取消'} onClick={p.onCancel} />
                </view>
            </view>
        </view>
    </PopupFrame>;
});
