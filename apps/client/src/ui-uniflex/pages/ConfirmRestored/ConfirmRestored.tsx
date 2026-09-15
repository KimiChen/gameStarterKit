import { defineView } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { CancelButton } from '../../components/button/CancelButton';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import type { ConfirmLogic } from '../../../logic/page/ConfirmLogic';

export interface ConfirmRestoredParams {
    readonly logic: ConfirmLogic;
    readonly isActive: () => boolean;
}

export const ConfirmRestored = defineView<ConfirmRestoredParams, boolean>(
    { zIndex: 'window' },
    (context) => {
        const params = context.params.logic;
        const hasCancel = params.noText !== null;
        return (
            <view
                name="ConfirmRestored"
                style={{
                    width: 750,
                    height: '100%',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <view
                    name="ConfirmRestored/Backdrop"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#00000088',
                    }}
                />
                <view name="ConfirmRestored/Panel" style={{ width: 708, height: 375, position: 'relative' }}>
                    <image
                        name="ConfirmRestored/Background"
                        style={{ position: 'absolute', left: 0, top: 0, width: 708, height: 375, sizeMode: 'sliced' }}
                        source={imageRef('ui/popup/prompt')}
                    />
                    <text
                        name="ConfirmRestored/Title"
                        value={params.title ?? '提示'}
                        style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58, font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }}
                    />
                    <text
                        name="ConfirmRestored/Message"
                        value={params.content}
                        style={{
                            position: 'absolute',
                            left: 40,
                            top: 132,
                            width: 628,
                            height: 48,
                            font: fontRef('fonts/regular', 700),
                            fontSize: 28,
                            color: '#3f3254',
                            horizontalAlign: 'center',
                            verticalAlign: 'center',
                        }}
                    />
                    <view visible={hasCancel} style={{ position: 'absolute', left: 397, top: 233 }}>
                        <CancelButton label={params.noText ?? '取消'} onClick={() => {
                            if (context.params.isActive()) params.no();
                        }} />
                    </view>
                    <view style={{ position: 'absolute', left: 55, top: 233 }}>
                        <ConfirmButton label={params.yesText ?? '确定'} onClick={() => {
                            if (context.params.isActive()) params.yes();
                        }} />
                    </view>
                </view>
            </view>
        );
    },
);
