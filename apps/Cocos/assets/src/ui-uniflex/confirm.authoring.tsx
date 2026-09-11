import { defineView } from '@uniflex/compiler';
import { fontRef } from '../kits/uniflex/api/core/index';
import type { ConfirmLogic } from '../logic/page/ConfirmLogic';

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
                <view
                    name="Confirm/Panel"
                    style={{
                        width: 620,
                        minHeight: 300,
                        padding: { left: 34, right: 34, top: 30, bottom: 26 },
                        flexDirection: 'column',
                        gap: 24,
                        backgroundColor: '#26354a',
                    }}
                >
                    <text
                        value={params.title ?? '提示'}
                        style={{ font: fontRef('fonts/regular', 400), width: '100%', fontSize: 34, color: '#ffffff', horizontalAlign: 'center' }}
                    />
                    <text
                        value={params.content}
                        style={{
                            width: '100%',
                            font: fontRef('fonts/regular', 400),
                            flexGrow: 1,
                            fontSize: 26,
                            lineHeight: 38,
                            color: '#ffffff',
                            wrap: true,
                            horizontalAlign: 'center',
                        }}
                    />
                    <view
                        style={{
                            width: '100%',
                            height: 88,
                            flexDirection: 'row',
                            justifyContent: 'center',
                            gap: 18,
                        }}
                    >
                        <view
                            visible={hasCancel}
                            interaction="press"
                            onClick={() => {
                                if (context.params.isActive()) params.no();
                            }}
                            style={{ width: 220, height: 78, backgroundColor: '#53657d' }}
                        >
                            <text
                                value={params.noText ?? '取消'}
                                style={{ font: fontRef('fonts/regular', 400), width: '100%', height: '100%', fontSize: 26, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }}
                            />
                        </view>
                        <view
                            interaction="press"
                            onClick={() => {
                                if (context.params.isActive()) params.yes();
                            }}
                            style={{ width: 220, height: 78, backgroundColor: '#2f9f75' }}
                        >
                            <text
                                value={params.yesText ?? '确定'}
                                style={{ font: fontRef('fonts/regular', 400), width: '100%', height: '100%', fontSize: 26, color: '#ffffff', horizontalAlign: 'center', verticalAlign: 'center' }}
                            />
                        </view>
                    </view>
                </view>
            </view>
        );
    },
);
