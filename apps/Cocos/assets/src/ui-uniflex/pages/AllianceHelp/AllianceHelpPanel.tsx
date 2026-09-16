import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CloseButton } from '../../components/popup/CloseButton';
import { PopupBackground } from '../../components/popup/PopupBackground';

export interface AllianceHelpPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly pointsLabel?: string;
    readonly pointsText?: string;
    readonly emptyText?: string;
    readonly actionLabel?: string;
    readonly onClose?: () => void;
    readonly onCreate?: () => void;
    readonly onAction?: (id: string) => void;
}

const LABEL = '#59496E';
const VALUE = '#33312E';
const GRAY = '#837A91';
const BUTTON_WIDTH = 255;
const BUTTON_HEIGHT = 102;

export const AllianceHelpPanel = defineComponent<AllianceHelpPanelProps>((p) => {
    const buttonWidth = BUTTON_WIDTH;
    const buttonHeight = BUTTON_HEIGHT;
    const close = () => {
        p.onClose?.();
        p.onAction?.('close');
    };
    const create = () => {
        p.onCreate?.();
        p.onAction?.('create');
    };
    return (
        <view name="AllianceHelp" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <view name="AllianceHelp/Mask" interaction="press"
                style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#00000099' }} />
            <view name="AllianceHelp/Window"
                style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 992 }}>
                <PopupBackground kind="prompt" />
                <text value={p.title ?? '联盟帮助'}
                    style={{ position: 'absolute', left: 90, top: 18, width: 528, height: 58,
                        font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                        outlineColor: '#593D84', outlineWidth: 2,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <CloseButton onClick={close} />

                <image source={imageRef('ui/alliance/help-badge')}
                    style={{ position: 'absolute', left: 67, top: 144, width: 100, height: 78 }} />
                <text value={p.pointsLabel ?? '今日帮助积分奖励'}
                    style={{ position: 'absolute', left: 182, top: 133, width: 452, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: LABEL, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
                <image source={imageRef('ui/alliance/help-track')}
                    style={{ position: 'absolute', left: 182, top: 182, width: 452, height: 38, sizeMode: 'sliced' }} />
                <text value={p.pointsText ?? '0/3000'}
                    style={{ position: 'absolute', left: 182, top: 182, width: 452, height: 38,
                        font: fontRef('fonts/regular', 700), fontSize: 26, color: VALUE, bold: true,
                        outlineColor: '#F6EFE3', outlineWidth: 2,
                        horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />

                <image source={imageRef('ui/alliance/input-bg')}
                    style={{ position: 'absolute', left: 23, top: 280, width: 663, height: 544, sizeMode: 'sliced' }} />
                <image source={imageRef('ui/backpack/empty')}
                    style={{ position: 'absolute', left: 301, top: 455, width: 108, height: 116 }} />
                <text value={p.emptyText ?? '暂无礼物'}
                    style={{ position: 'absolute', left: 23, top: 610, width: 663, height: 40,
                        font: fontRef('fonts/regular', 700), fontSize: 40, color: GRAY, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />

                <view style={{ position: 'absolute', left: 227, top: 850, width: buttonWidth, height: buttonHeight }}>
                    <ConfirmButton label={p.actionLabel ?? '创建'} width={buttonWidth} height={buttonHeight}
                        onClick={create} />
                </view>
            </view>
        </view>
    );
});
