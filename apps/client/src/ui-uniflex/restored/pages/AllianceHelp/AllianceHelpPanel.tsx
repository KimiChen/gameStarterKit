import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { EmptyState } from '../../components/empty/EmptyState';
import { PopupFrame } from '../../components/popup/PopupFrame';

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
    const emptyIcon = imageRef('ui/backpack/empty');
    const emptyText = p.emptyText ?? '暂无礼物';
    return (
        <view name="AllianceHelp" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '联盟帮助'} kind="prompt" left={21} top={318} width={708} height={992}
                onClose={close} />
            <view style={{ position: 'absolute', left: 21, top: 318, width: 708, height: 992 }}>
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
                <EmptyState icon={emptyIcon} left={301} top={455} label={emptyText}
                    labelLeft={23} labelTop={610} labelWidth={663} />

                <view style={{ position: 'absolute', left: 227, top: 850, width: buttonWidth, height: buttonHeight }}>
                    <ConfirmButton label={p.actionLabel ?? '创建'} width={buttonWidth} height={buttonHeight}
                        onClick={create} />
                </view>
            </view>
        </view>
    );
});
