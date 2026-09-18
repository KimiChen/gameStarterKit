import { defineView } from '@uniflex/compiler';
import { PopupFrame } from '../../../restored/components/popup/PopupFrame';
import { ConfirmButton } from '../../../restored/components/button/ConfirmButton';
import { CancelButton } from '../../../restored/components/button/CancelButton';
import { theme } from '../../../themes/active';

/** Optional presentation overrides; normal pages use the shared active theme. */
export interface PromptTheme {
    readonly titleColor?: string;
    readonly titleOutline?: string;
    readonly messageColor?: string;
}
export interface PromptRestoredParams {
    readonly title?: string;
    readonly message: string;
    readonly confirmText?: string;
    readonly cancelText?: string | null;
    readonly theme?: PromptTheme;
    readonly onConfirm: () => void;
    readonly onCancel?: () => void;
    readonly onClose?: () => void;
}

const PANEL_LEFT = 21;
const PANEL_TOP = 624;
const PANEL_WIDTH = 708;
const PANEL_HEIGHT = 375;

export const PromptRestored = defineView<PromptRestoredParams, void>({ zIndex: 'window' }, (context) => {
    const p = context.params;
    return (
        <view name="PromptRestoredPage" style={{ width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '提示'} left={PANEL_LEFT} top={PANEL_TOP}
                width={PANEL_WIDTH} height={PANEL_HEIGHT}
                titleColor={p.theme?.titleColor} titleOutline={p.theme?.titleOutline} onClose={p.onClose} />
            <view name="PromptRestored/Content"
                style={{ position: 'absolute', left: PANEL_LEFT + 40, top: PANEL_TOP + 108, width: 628, height: 229 }}>
                <text name="PromptRestored/Message" value={p.message}
                    style={{ width: '100%', height: 104, font: theme.font, fontSize: 28,
                        color: p.theme?.messageColor ?? theme.text,
                        horizontalAlign: 'center', verticalAlign: 'center', wrap: true, overflow: 'shrink' }} />
                <view name="PromptRestored/Actions" style={{ position: 'absolute', bottom: 0, width: '100%',
                    flexDirection: 'row', justifyContent: 'center', gap: 87 }}>
                    <ConfirmButton label={p.confirmText} onClick={p.onConfirm} />
                    <view visible={p.cancelText !== null}>
                        <CancelButton label={p.cancelText ?? '取消'} onClick={p.onCancel} />
                    </view>
                </view>
            </view>
        </view>
    );
});
