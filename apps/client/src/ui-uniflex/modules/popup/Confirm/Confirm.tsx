import { defineView } from '@uniflex/compiler';
import { fontRef } from '../../../../kits/uniflex/api/core/index';
import { CancelButton } from '../../../components/button/CancelButton';
import { ConfirmButton } from '../../../components/button/ConfirmButton';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import type { ConfirmLogic } from '../../../../logic/page/ConfirmLogic';

export interface ConfirmParams {
    readonly logic: ConfirmLogic;
    readonly isActive: () => boolean;
}

const PANEL_LEFT = 21;
const PANEL_TOP = 624;
const PANEL_WIDTH = 708;
const PANEL_HEIGHT = 375;

export const Confirm = defineView<ConfirmParams, boolean>(
    { zIndex: 'window' },
    (context) => {
        const params = context.params.logic;
        const hasCancel = params.noText !== null;
        const close = () => {
            if (context.params.isActive()) params.no();
        };
        const yes = () => {
            if (context.params.isActive()) params.yes();
        };
        const no = () => {
            if (context.params.isActive()) params.no();
        };
        const font = fontRef('fonts/regular', 700);
        const contentTop = PANEL_TOP + 96;
        const contentHeight = PANEL_HEIGHT - 96;
        return (
            <view name="Confirm" style={{ width: 750, height: 1624 }}>
                <PopupFrame title={params.title ?? '提示'} kind="prompt" left={PANEL_LEFT} top={PANEL_TOP}
                    width={PANEL_WIDTH} height={PANEL_HEIGHT} onClose={close} />
                <view name="Confirm/Content"
                    style={{ position: 'absolute', left: PANEL_LEFT, top: contentTop, width: PANEL_WIDTH, height: contentHeight }}>
                    <text name="Confirm/Message" value={params.content}
                        style={{
                            position: 'absolute',
                            left: 40,
                            top: 36,
                            width: 628,
                            height: 48,
                            font: font,
                            fontSize: 28,
                            color: '#3f3254',
                            horizontalAlign: 'center',
                            verticalAlign: 'center',
                        }} />
                    <view visible={hasCancel} style={{ position: 'absolute', left: 397, top: 137 }}>
                        <CancelButton label={params.noText ?? '取消'} onClick={no} />
                    </view>
                    <view style={{ position: 'absolute', left: 55, top: 137 }}>
                        <ConfirmButton label={params.yesText ?? '确定'} onClick={yes} />
                    </view>
                </view>
            </view>
        );
    },
);
