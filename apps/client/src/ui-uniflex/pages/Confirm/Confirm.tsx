import { defineView } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import type { ConfirmLogic } from '../../../logic/page/ConfirmLogic';

export interface ConfirmParams {
    readonly logic: ConfirmLogic;
    readonly isActive: () => boolean;
}

export const Confirm = defineView<ConfirmParams, boolean>(
    { zIndex: 'window' },
    (context) => {
        const params = context.params.logic;
        const hasCancel = params.noText !== null;
        return (
            <view
                name="Confirm"
                style={{
                    width: 750,
                    height: '100%',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <view
                    name="Confirm/Backdrop"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#00000088',
                    }}
                />
                <view name="Confirm/Panel" style={{ width: 708, height: 375, position: 'relative' }}>
                    <image
                        name="Confirm/Background"
                        style={{ position: 'absolute', left: 0, top: 0, width: 708, height: 375, sizeMode: 'sliced' }}
                        source={imageRef('ui/popup/prompt')}
                    />
                    <text
                        name="Confirm/Title"
                        value={params.title ?? '提示'}
                        style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58, font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }}
                    />
                    <text
                        name="Confirm/Message"
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
                    <view name="Confirm/CancelButton" visible={hasCancel} interaction="press"
                        onClick={() => {
                            if (context.params.isActive()) params.no();
                        }}
                        style={{ position: 'absolute', left: 397, top: 233, width: 257, height: 110 }}>
                        <image style={{ position: 'absolute', left: 0, top: 0, width: 255, height: 102, sizeMode: 'sliced' }} source={imageRef('ui/button/cancel')} />
                            <text
                                value={params.noText ?? '取消'}
                                style={{ position: 'absolute', left: 0, top: 13, width: 255, height: 70, font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }}
                            />
                    </view>
                    <view name="ConfirmButton" interaction="press"
                        onClick={() => {
                            if (context.params.isActive()) params.yes();
                        }}
                        style={{ position: 'absolute', left: 55, top: 233, width: 257, height: 110 }}>
                        <image style={{ position: 'absolute', left: 0, top: 0, width: 255, height: 102, sizeMode: 'sliced' }} source={imageRef('ui/button/confirm')} />
                            <text
                                value={params.yesText ?? '确定'}
                                style={{ position: 'absolute', left: 0, top: 13, width: 255, height: 70, font: fontRef('fonts/regular', 400), fontSize: 40, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }}
                            />
                    </view>
                </view>
            </view>
        );
    },
);
