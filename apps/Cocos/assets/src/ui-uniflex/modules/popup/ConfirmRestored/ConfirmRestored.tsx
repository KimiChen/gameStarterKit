import { defineView } from '@uniflex/compiler';
import { PopupFrame } from '../../../restored/components/popup/PopupFrame';
import { ConfirmButton } from '../../../restored/components/button/ConfirmButton';
import { CancelButton } from '../../../restored/components/button/CancelButton';
import { theme } from '../../../themes/active';

/** Optional presentation overrides; normal pages use the shared active theme. */
export interface ConfirmRestoredTheme {
    readonly messageColor?: string;
}
export interface ConfirmRestoredParams {
    readonly title?: string;
    readonly message: string;
    readonly confirmText?: string;
    readonly cancelText?: string | null;
    readonly theme?: ConfirmRestoredTheme;
    readonly onConfirm: () => void;
    readonly onCancel?: () => void;
    readonly onClose?: () => void;
}

const PANEL_LEFT = 21;
const PANEL_TOP = 624;
const PANEL_WIDTH = 708;
const PANEL_HEIGHT = 375;

export const ConfirmRestored = defineView<ConfirmRestoredParams, void>({ zIndex: 'window' }, (context) => {
    const params = context.params;
    return (
        <view name="ConfirmRestored" style={{ width: 750, height: 1624 }}>
            <PopupFrame title={params.title ?? '提示'} left={PANEL_LEFT} top={PANEL_TOP}
                width={PANEL_WIDTH} height={PANEL_HEIGHT} onClose={params.onClose} />
            <view name="ConfirmRestored/Content"
                style={{ position: 'absolute', left: PANEL_LEFT + 40, top: PANEL_TOP + 108, width: 628, height: 229 }}>
                <text name="ConfirmRestored/Message" value={params.message}
                    style={{ width: '100%', height: 104, font: theme.font, fontSize: 28,
                        color: params.theme?.messageColor ?? theme.text,
                        horizontalAlign: 'center', verticalAlign: 'center', wrap: true, overflow: 'shrink' }} />
                <view name="ConfirmRestored/Actions" style={{ position: 'absolute', bottom: 0, width: '100%',
                    flexDirection: 'row', justifyContent: 'center', gap: 87 }}>
                    <ConfirmButton label={params.confirmText} onClick={params.onConfirm} />
                    <view visible={params.cancelText !== null}>
                        <CancelButton label={params.cancelText ?? '取消'} onClick={params.onCancel} />
                    </view>
                </view>
            </view>
        </view>
    );
});
