import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { PopupFrame } from '../../components/popup/PopupFrame';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { HeroStarAttributeRow, type HeroStarAttributeRowProps } from './HeroStarAttributeRow';

export interface HeroStarAttribute extends Omit<HeroStarAttributeRowProps, 'striped'> {
    readonly striped?: boolean;
}

export interface HeroStarUpgradePanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly stars?: number;
    readonly combatPower?: string;
    readonly powerGain?: string;
    readonly attributes?: readonly HeroStarAttribute[];
    readonly owned?: number;
    readonly required?: number;
    readonly exchangeCount?: string | number;
    readonly onClose?: () => void;
    readonly onUpgrade?: () => void;
    readonly onObtainFragments?: () => void;
    readonly onExchange?: () => void;
}

const defaultAttributes: readonly HeroStarAttribute[] = [
    { name: '攻击力', current: '44444', next: '44444' },
    { name: '攻击力', current: '44444', next: '44444' },
    { name: '攻击力', current: '44444', next: '44444' },
    { name: '攻击力', current: '44444', next: '44444' },
];
const starSlots = [148, 234, 320, 405, 491] as const;

export const HeroStarUpgradePanel = defineComponent<HeroStarUpgradePanelProps>((p) => {
    const stars = Math.max(0, Math.min(5, p.stars ?? 1));
    const attributes = p.attributes ?? defaultAttributes;
    const owned = p.owned ?? 40;
    const required = p.required ?? 45;
    const progressText = `${owned}/${required}`;
    const progressTrack = imageRef('ui/star-upgrade/progress-track');
    const progressFill = imageRef('ui/star-upgrade/progress-fill');
    const rows = [334, 389, 444, 499] as const;
    const starEmpty = imageRef('ui/star-upgrade/star-empty');
    const starFull = imageRef('ui/star-upgrade/star-full');
    const star1 = stars >= 1 ? starFull : starEmpty;
    const star2 = stars >= 2 ? starFull : starEmpty;
    const star3 = stars >= 3 ? starFull : starEmpty;
    const star4 = stars >= 4 ? starFull : starEmpty;
    const star5 = stars >= 5 ? starFull : starEmpty;
    return (
        <view name="HeroStarUpgrade" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <PopupFrame title={p.title ?? '升星'} kind="prompt" left={21} top={377} width={708} height={870}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 377, width: 708, height: 870 }}>
                <image source={star1}
                    style={{ position: 'absolute', left: starSlots[0], top: 123, width: 68, height: 64 }} />
                <image source={star2}
                    style={{ position: 'absolute', left: starSlots[1], top: 123, width: 68, height: 64 }} />
                <image source={star3}
                    style={{ position: 'absolute', left: starSlots[2], top: 123, width: 68, height: 64 }} />
                <image source={star4}
                    style={{ position: 'absolute', left: starSlots[3], top: 123, width: 68, height: 64 }} />
                <image source={star5}
                    style={{ position: 'absolute', left: starSlots[4], top: 123, width: 68, height: 64 }} />
                <image source={imageRef('ui/star-upgrade/power')}
                    style={{ position: 'absolute', left: 120, top: 219, width: 469, height: 55, sizeMode: 'sliced' }} />
                <view style={{ position: 'absolute', left: 261, top: 219, width: 255, height: 55 }}>
                    <text value={p.combatPower ?? '9,999'}
                        style={{ position: 'absolute', left: 0, top: 0, width: 110, height: 55,
                            font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                            outlineColor: '#000000', outlineWidth: 2,
                            horizontalAlign: 'right', verticalAlign: 'center' }} />
                    <text value={p.powerGain ?? '+33800'}
                        style={{ position: 'absolute', left: 108, top: 0, width: 147, height: 55,
                            font: fontRef('fonts/regular', 700), fontSize: 40, color: '#65EE62', bold: true,
                            outlineColor: '#000000', outlineWidth: 2,
                            horizontalAlign: 'left', verticalAlign: 'center' }} />
                </view>
                <image source={imageRef('ui/star-upgrade/attribute-panel')}
                    style={{ position: 'absolute', left: 12, top: 284, width: 683, height: 280, sizeMode: 'sliced' }} />
                <text value="属性"
                    style={{ position: 'absolute', left: 12, top: 284, width: 683, height: 50,
                        font: fontRef('fonts/regular', 700), fontSize: 30, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
                <view style={{ position: 'absolute', left: 12, top: rows[0], width: 683, height: 55 }}>
                    <HeroStarAttributeRow striped={attributes[0]?.striped === true}
                        name={attributes[0]?.name ?? '攻击力'}
                        current={attributes[0]?.current ?? '44444'}
                        next={attributes[0]?.next ?? '44444'} />
                </view>
                <view style={{ position: 'absolute', left: 12, top: rows[1], width: 683, height: 55 }}>
                    <HeroStarAttributeRow striped={attributes[1]?.striped !== false}
                        name={attributes[1]?.name ?? '攻击力'}
                        current={attributes[1]?.current ?? '44444'}
                        next={attributes[1]?.next ?? '44444'} />
                </view>
                <view style={{ position: 'absolute', left: 12, top: rows[2], width: 683, height: 55 }}>
                    <HeroStarAttributeRow striped={attributes[2]?.striped === true}
                        name={attributes[2]?.name ?? '攻击力'}
                        current={attributes[2]?.current ?? '44444'}
                        next={attributes[2]?.next ?? '44444'} />
                </view>
                <view style={{ position: 'absolute', left: 12, top: rows[3], width: 683, height: 55 }}>
                    <HeroStarAttributeRow striped={attributes[3]?.striped !== false}
                        name={attributes[3]?.name ?? '攻击力'}
                        current={attributes[3]?.current ?? '44444'}
                        next={attributes[3]?.next ?? '44444'} />
                </view>
                <ProgressBar left={157} top={604} width={391} height={44}
                    track={progressTrack} fill={progressFill} value={owned} max={required}
                    label={progressText} labelColor="#65EE62" labelSize={32} />
                <image source={imageRef('ui/star-upgrade/fragment')}
                    style={{ position: 'absolute', left: 81, top: 575, width: 94, height: 103 }} />
                <view interaction="press" accessibilityLabel="获取碎片" onClick={() => p.onObtainFragments?.()}
                    style={{ position: 'absolute', left: 557, top: 586, width: 76, height: 85 }}>
                    <image source={imageRef('ui/backpack/button-plus')} style={{ width: 76, height: 85 }} />
                </view>
                <view interaction="press" onClick={() => p.onExchange?.()}
                    style={{ position: 'absolute', left: 25, top: 733, width: 96, height: 117 }}>
                    <image source={imageRef('ui/star-upgrade/exchange')}
                        style={{ position: 'absolute', left: 2, top: 2, width: 81, height: 81 }} />
                    <text value={String(p.exchangeCount ?? 125)}
                        style={{ position: 'absolute', left: 2, top: 46, width: 81, height: 32,
                            font: fontRef('fonts/regular', 700), fontSize: 28, color: '#ffffff', bold: true,
                            outlineColor: '#000000', outlineWidth: 2,
                            horizontalAlign: 'center', verticalAlign: 'center' }} />
                    <text value="兑换"
                        style={{ position: 'absolute', left: 2, top: 85, width: 81, height: 32,
                            font: fontRef('fonts/regular', 700), fontSize: 28, color: '#837A91', bold: true,
                            horizontalAlign: 'center', verticalAlign: 'center' }} />
                </view>
                <view style={{ position: 'absolute', left: 226, top: 728, width: 255, height: 102 }}>
                    <ConfirmButton label="升星" onClick={p.onUpgrade} />
                </view>
            </view>
        </view>
    );
});
