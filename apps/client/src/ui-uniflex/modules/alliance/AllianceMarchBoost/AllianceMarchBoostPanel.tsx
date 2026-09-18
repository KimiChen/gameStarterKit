import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { CancelButton } from '../../../components/button/CancelButton';
import { ConfirmButton } from '../../../components/button/ConfirmButton';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ProgressBar } from '../../../components/progress/ProgressBar';

export interface AllianceMarchBoostPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly skillName?: string;
    readonly skillDesc?: string;
    readonly level?: string;
    readonly currentAttr?: string;
    readonly nextAttr?: string;
    readonly progressText?: string;
    readonly progressCurrent?: number;
    readonly progressMax?: number;
    readonly rewardGem?: string;
    readonly rewardLeaf?: string;
    readonly rewardTicket?: string;
    readonly leftHint?: string;
    readonly rightHint?: string;
    readonly payGem?: string;
    readonly payCoin?: string;
    readonly onClose?: () => void;
    readonly onPayGem?: () => void;
    readonly onPayCoin?: () => void;
}

const PSD_FILL_WIDTH = 329;
const DARK = '#3F3254';
const GRAY = '#837A91';

export const AllianceMarchBoostPanel = defineComponent<AllianceMarchBoostPanelProps>((p) => {
    const progressCurrent = p.progressCurrent;
    const progressMax = p.progressMax;
    const hasProgress = progressCurrent != null && progressMax != null;
    const progressText = hasProgress
        ? `${progressCurrent}/${progressMax}`
        : (p.progressText ?? '54826/5245212');
    const fillWidth = hasProgress ? 0 : PSD_FILL_WIDTH;
    const progressTrack = imageRef('ui/alliance-march/track');
    const progressFill = imageRef('ui/alliance-march/fill');
    return (
        <view name="AllianceMarchBoost" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '行军加速'} kind="prompt" left={21} top={371} width={708} height={882}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 371, width: 708, height: 882 }}>
                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 99, width: 683, height: 164, sizeMode: 'sliced' }} />
                <image source={imageRef('ui/alliance-march/skill')}
                    style={{ position: 'absolute', left: 21, top: 107, width: 128, height: 148 }} />
                <text value={p.level ?? '1/5'}
                    style={{ position: 'absolute', left: 21, top: 220, width: 128, height: 22,
                        font: fontRef('fonts/regular', 700), fontSize: 20, color: '#ffffff', bold: true,
                        outlineColor: '#000000', outlineWidth: 2,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <text value={p.skillName ?? '行军加速'}
                    style={{ position: 'absolute', left: 171, top: 116, width: 400, height: 29,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: DARK, bold: true,
                        verticalAlign: 'center' }} />
                <text value={p.skillDesc ?? '联盟成员航行速度增加'}
                    style={{ position: 'absolute', left: 173, top: 163, width: 500, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: GRAY, bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />

                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 280, width: 683, height: 100, sizeMode: 'sliced' }} />
                <text value="当前属性"
                    style={{ position: 'absolute', left: 26, top: 288, width: 200, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        verticalAlign: 'center' }} />
                <text value={p.currentAttr ?? '0%'}
                    style={{ position: 'absolute', left: 500, top: 288, width: 179, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />
                <text value="下一级"
                    style={{ position: 'absolute', left: 26, top: 334, width: 200, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        verticalAlign: 'center' }} />
                <text value={p.nextAttr ?? '10%'}
                    style={{ position: 'absolute', left: 500, top: 334, width: 179, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />

                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 399, width: 683, height: 74, sizeMode: 'sliced' }} />
                <ProgressBar left={85} top={421} width={573} height={28}
                    track={progressTrack} fill={progressFill} value={progressCurrent} max={progressMax}
                    fillWidth={fillWidth} label={progressText} />
                <image source={imageRef('ui/alliance-march/gem-slot')}
                    style={{ position: 'absolute', left: 18, top: 404, width: 65, height: 65 }} />
                <image source={imageRef('ui/alliance-march/gem')}
                    style={{ position: 'absolute', left: 20, top: 410, width: 59, height: 53 }} />

                <text value="奖励"
                    style={{ position: 'absolute', left: 12, top: 489, width: 683, height: 30,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: DARK, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 532, width: 683, height: 84, sizeMode: 'sliced' }} />
                <view style={{ position: 'absolute', left: 58, top: 549, width: 210, height: 53,
                    flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <image source={imageRef('ui/alliance-march/gem')}
                        style={{ width: 59, height: 53 }} />
                    <text value={p.rewardGem ?? '30000'}
                        style={{ width: 120, height: 53,
                            font: fontRef('fonts/regular', 700), fontSize: 26, color: DARK, bold: true,
                            horizontalAlign: 'left', verticalAlign: 'center' }} />
                </view>
                <view style={{ position: 'absolute', left: 284, top: 552, width: 200, height: 50,
                    flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <image source={imageRef('ui/alliance-march/leaf')}
                        style={{ width: 51, height: 50 }} />
                    <text value={p.rewardLeaf ?? '30000'}
                        style={{ width: 120, height: 50,
                            font: fontRef('fonts/regular', 700), fontSize: 26, color: DARK, bold: true,
                            horizontalAlign: 'left', verticalAlign: 'center' }} />
                </view>
                <view style={{ position: 'absolute', left: 495, top: 551, width: 190, height: 52,
                    flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <image source={imageRef('ui/alliance-march/ticket')}
                        style={{ width: 48, height: 52 }} />
                    <text value={p.rewardTicket ?? '30000'}
                        style={{ width: 120, height: 52,
                            font: fontRef('fonts/regular', 700), fontSize: 26, color: DARK, bold: true,
                            horizontalAlign: 'left', verticalAlign: 'center' }} />
                </view>

                <text value={p.leftHint ?? '没有次数限制'}
                    style={{ position: 'absolute', left: 105, top: 684, width: 155, height: 25,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: DARK, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <text value={p.rightHint ?? '次数：3/50'}
                    style={{ position: 'absolute', left: 458, top: 684, width: 133, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: DARK, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />

                <view style={{ position: 'absolute', left: 55, top: 729, width: 255, height: 102 }}>
                    <ConfirmButton label={p.payGem ?? '10'}
                        icon={imageRef('ui/alliance-march/pay-gem')} iconWidth={51} iconHeight={49}
                        onClick={p.onPayGem} />
                </view>
                <view style={{ position: 'absolute', left: 397, top: 729, width: 255, height: 102 }}>
                    <CancelButton label={p.payCoin ?? '1000'}
                        icon={imageRef('ui/alliance-march/pay-coin')} iconWidth={54} iconHeight={55}
                        onClick={p.onPayCoin} />
                </view>
            </view>
        </view>
    );
});
