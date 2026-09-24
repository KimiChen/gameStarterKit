import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { confirmButton } from '../../../components/button/buttonSkins';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { PopupFrame } from '../../../components/popup/PopupFrame';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { starUpgradeProgress } from '../../../components/progress/progressBarSkins';
import { STAR_ROW_HEIGHT, STAR_ROW_WIDTH, StarRow } from '../../../gamecomponents/star/StarRow';
import { HeroStarAttributeRow, type HeroStarAttributeRowProps } from './HeroStarAttributeRow';

export interface HeroStarAttribute extends Omit<HeroStarAttributeRowProps, 'striped'> {
    readonly striped?: boolean;
}

export interface HeroStarUpgradePanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    /** Total star level, 0–25. StarRow splits it across the five stars. */
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

const EMPTY_ATTRIBUTE: HeroStarAttribute = { name: '', current: '', next: '' };

const DEFAULT_ATTRIBUTES: readonly HeroStarAttribute[] = [
    { name: '攻击力', current: '44444', next: '44444' },
    { name: '攻击力', current: '44444', next: '44444' },
    { name: '攻击力', current: '44444', next: '44444' },
    { name: '攻击力', current: '44444', next: '44444' },
];

const STAR_SLOT_LEFT = 148;
const STAR_SLOT_TOP = 123;

export const HeroStarUpgradePanel = defineComponent<HeroStarUpgradePanelProps>((p) => {
    const stars = p.stars ?? 0;
    const attributes = p.attributes ?? DEFAULT_ATTRIBUTES;
    const attribute0 = attributes[0] ?? EMPTY_ATTRIBUTE;
    const attribute1 = attributes[1] ?? EMPTY_ATTRIBUTE;
    const attribute2 = attributes[2] ?? EMPTY_ATTRIBUTE;
    const attribute3 = attributes[3] ?? EMPTY_ATTRIBUTE;
    const owned = p.owned ?? 40;
    const required = p.required ?? 45;
    const progressText = `${owned}/${required}`;
    const rows = [334, 389, 444, 499] as const;
    return (
        <view name="HeroStarUpgrade" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }}>
            <PopupFrame title={p.title ?? '升星'} left={21} top={232} width={708} height={870}
                onClose={p.onClose} />
            <view style={{ position: 'absolute', left: 21, top: 232, width: 708, height: 870 }}>
                <view style={{ position: 'absolute', left: STAR_SLOT_LEFT, top: STAR_SLOT_TOP, width: STAR_ROW_WIDTH, height: STAR_ROW_HEIGHT }}>
                    <StarRow value={stars} />
                </view>
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
                <view visible={attributes[0] != null} style={{ position: 'absolute', left: 12, top: rows[0], width: 683, height: 55 }}>
                    <HeroStarAttributeRow icon={attribute0.icon} striped={attribute0.striped === true}
                        name={attribute0.name}
                        current={attribute0.current}
                        next={attribute0.next} />
                </view>
                <view visible={attributes[1] != null} style={{ position: 'absolute', left: 12, top: rows[1], width: 683, height: 55 }}>
                    <HeroStarAttributeRow icon={attribute1.icon} striped={attribute1.striped !== false}
                        name={attribute1.name}
                        current={attribute1.current}
                        next={attribute1.next} />
                </view>
                <view visible={attributes[2] != null} style={{ position: 'absolute', left: 12, top: rows[2], width: 683, height: 55 }}>
                    <HeroStarAttributeRow icon={attribute2.icon} striped={attribute2.striped === true}
                        name={attribute2.name}
                        current={attribute2.current}
                        next={attribute2.next} />
                </view>
                <view visible={attributes[3] != null} style={{ position: 'absolute', left: 12, top: rows[3], width: 683, height: 55 }}>
                    <HeroStarAttributeRow icon={attribute3.icon} striped={attribute3.striped !== false}
                        name={attribute3.name}
                        current={attribute3.current}
                        next={attribute3.next} />
                </view>
                <ProgressBar left={157} top={604} width={391} height={44}
                    skin={starUpgradeProgress} value={owned} max={required} label={progressText} />
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
                    <ActionButton skin={confirmButton} label="升星" onClick={p.onUpgrade} />
                </view>
            </view>
        </view>
    );
});
