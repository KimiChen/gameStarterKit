import { defineComponent, For } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { cancelButton, confirmButton } from '../../../components/button/buttonSkins';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { RewardItem, type RewardItemData } from '../../../gamecomponents/item/RewardItem';
import { DEFAULT_TECH_ID, resolveAllianceTechView } from '../../../gamecomponents/tech/allianceTech';
import { TechIcon } from '../../../gamecomponents/tech/TechIcon';

export interface AllianceMarchBoostPanelProps {
    readonly visible?: boolean;
    readonly techId?: number;
    readonly level?: number;
    readonly donate?: number;
    readonly donateMax?: number;
    readonly timesUsed?: number;
    readonly timesLimit?: number;
    readonly rewards?: readonly RewardItemData[];
    readonly payGem?: string;
    readonly payCoin?: string;
    readonly onClose?: () => void;
    readonly onPayGem?: () => void;
    readonly onPayCoin?: () => void;
}

const DARK = '#3F3254';
const GRAY = '#837A91';

export const AllianceMarchBoostPanel = defineComponent<AllianceMarchBoostPanelProps>((p) => {
    const techId = p.techId ?? DEFAULT_TECH_ID;
    const view = resolveAllianceTechView(techId, {
        level: p.level,
        donate: p.donate,
        donateMax: p.donateMax,
        timesUsed: p.timesUsed,
        timesLimit: p.timesLimit,
        payGem: p.payGem,
        payCoin: p.payCoin,
        rewards: p.rewards,
    });
    const title = view.title;
    const name = view.name;
    const desc = view.desc;
    const iconKind = view.iconKind;
    const levelText = view.levelText;
    const currentAttr = view.currentAttr;
    const nextAttr = view.nextAttr;
    const progressCurrent = view.progressCurrent;
    const progressMax = view.progressMax;
    const progressText = view.progressText;
    const rewards = view.rewards;
    const leftHint = view.leftHint;
    const rightHint = view.rightHint;
    const payGem = view.payGem;
    const payCoin = view.payCoin;
    const progressTrack = imageRef('ui/alliance-march/track');
    const progressFill = imageRef('ui/alliance-march/fill');
    const payGemIcon = imageRef('ui/alliance-march/pay-gem');
    const payCoinIcon = imageRef('ui/alliance-march/pay-coin');
    return (
        <view name="AllianceMarchBoost" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={title} left={21} top={371} width={708} height={882}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 371, width: 708, height: 882 }}>
                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 99, width: 683, height: 164, sizeMode: 'sliced' }} />
                <TechIcon left={21} top={107} width={128} height={148} kind={iconKind} level={levelText} />
                <text value={name}
                    style={{ position: 'absolute', left: 171, top: 116, width: 400, height: 29,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: DARK, bold: true,
                        verticalAlign: 'center' }} />
                <text value={desc}
                    style={{ position: 'absolute', left: 173, top: 163, width: 500, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: GRAY, bold: true,
                        verticalAlign: 'center', overflow: 'shrink' }} />

                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 280, width: 683, height: 100, sizeMode: 'sliced' }} />
                <text value="当前属性"
                    style={{ position: 'absolute', left: 26, top: 288, width: 200, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        verticalAlign: 'center' }} />
                <text value={currentAttr}
                    style={{ position: 'absolute', left: 500, top: 288, width: 179, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />
                <text value="下一级"
                    style={{ position: 'absolute', left: 26, top: 334, width: 200, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        verticalAlign: 'center' }} />
                <text value={nextAttr}
                    style={{ position: 'absolute', left: 500, top: 334, width: 179, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 24, color: GRAY, bold: true,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />

                <image source={imageRef('ui/alliance/announce-panel')}
                    style={{ position: 'absolute', left: 12, top: 399, width: 683, height: 74, sizeMode: 'sliced' }} />
                <ProgressBar left={85} top={421} width={573} height={28}
                    track={progressTrack} fill={progressFill} value={progressCurrent} max={progressMax}
                    label={progressText} />
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
                <For each={rewards} key="id">
                    {(item) => <RewardItem item={item} />}
                </For>

                <text value={leftHint}
                    style={{ position: 'absolute', left: 105, top: 684, width: 155, height: 25,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: DARK, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <text value={rightHint}
                    style={{ position: 'absolute', left: 458, top: 684, width: 133, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: DARK, bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />

                <view style={{ position: 'absolute', left: 55, top: 729, width: 255, height: 102 }}>
                    <ActionButton skin={confirmButton} label={payGem}
                        icon={payGemIcon} iconWidth={51} iconHeight={49}
                        onClick={p.onPayGem} />
                </view>
                <view style={{ position: 'absolute', left: 397, top: 729, width: 255, height: 102 }}>
                    <ActionButton skin={cancelButton} label={payCoin}
                        icon={payCoinIcon} iconWidth={54} iconHeight={55}
                        onClick={p.onPayCoin} />
                </view>
            </view>
        </view>
    );
});
