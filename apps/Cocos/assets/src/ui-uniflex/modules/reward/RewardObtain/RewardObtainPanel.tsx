import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ItemSlot } from '../../../gamecomponents/item/ItemSlot';

export interface RewardObtainEntry {
    readonly itemId: string;
    readonly count?: string;
    readonly detailCount?: string;
    readonly selected?: boolean;
}

export interface RewardObtainPanelProps {
    readonly title?: string;
    readonly hint?: string;
    readonly rewards?: readonly RewardObtainEntry[];
    readonly onClose?: () => void;
}

const TITLE_FONT = fontRef('fonts/regular', 700);
const HINT_FONT = fontRef('fonts/regular', 700);
const RAYS = imageRef('ui/reward/rays');
const CONFETTI = imageRef('ui/reward/confetti');
const BANNER = imageRef('ui/reward/banner');
const SELECTED = imageRef('ui/backpack/selection');

const DEFAULT_REWARDS: readonly RewardObtainEntry[] = [
    { itemId: 'book-orange', count: '99' },
    { itemId: 'scroll', count: '99', detailCount: '500' },
    { itemId: 'armor', count: '99' },
];

/** 750×1624 obtain overlay. Item frames come from ItemSlot. */
export const RewardObtainPanel = defineComponent<RewardObtainPanelProps>((p) => {
    const title = p.title ?? '获得物品';
    const hint = p.hint ?? '点击空白区域关闭';
    const rewards = p.rewards ?? DEFAULT_REWARDS;
    const left = rewards[0] ?? DEFAULT_REWARDS[0];
    const mid = rewards[1] ?? DEFAULT_REWARDS[1];
    const right = rewards[2] ?? DEFAULT_REWARDS[2];
    const leftId = left.itemId;
    const leftCount = left.count ?? '99';
    const leftDetail = left.detailCount ?? '';
    const leftSelected = left.selected === true;
    const midId = mid.itemId;
    const midCount = mid.count ?? '99';
    const midDetail = mid.detailCount ?? '';
    const midSelected = mid.selected === true;
    const rightId = right.itemId;
    const rightCount = right.count ?? '99';
    const rightDetail = right.detailCount ?? '';
    const rightSelected = right.selected === true;
    const onClose = p.onClose;
    return (
        <view name="RewardObtain" interaction="press" onClick={onClose}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <view name="RewardObtain/Mask"
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#000000b3' }} />
            <image name="RewardObtain/Rays" source={RAYS}
                style={{ position: 'absolute', left: 115, top: 317, width: 520, height: 367 }} />
            <image name="RewardObtain/Confetti" source={CONFETTI}
                style={{ position: 'absolute', left: 204, top: 310, width: 354, height: 381 }} />
            <image name="RewardObtain/Banner" source={BANNER}
                style={{ position: 'absolute', left: 46, top: 432, width: 658, height: 138 }} />
            <text name="RewardObtain/TitleShadow" value={title}
                style={{ position: 'absolute', left: 46, top: 462, width: 658, height: 58,
                    font: TITLE_FONT, fontSize: 50, color: '#8B511D', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <text name="RewardObtain/Title" value={title}
                style={{ position: 'absolute', left: 46, top: 459, width: 658, height: 58,
                    font: TITLE_FONT, fontSize: 50, color: '#FFFFFF', bold: true,
                    outlineColor: '#975626', outlineWidth: 3,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
            <ItemSlot left={107} top={684} itemId={leftId} count={leftCount} detailCount={leftDetail} />
            <image name="RewardObtain/LeftSelected" visible={leftSelected} source={SELECTED}
                style={{ position: 'absolute', left: 80, top: 650, width: 208, height: 222, sizeMode: 'sliced' }} />
            <ItemSlot left={298} top={684} itemId={midId} count={midCount} detailCount={midDetail} />
            <image name="RewardObtain/MidSelected" visible={midSelected} source={SELECTED}
                style={{ position: 'absolute', left: 271, top: 650, width: 208, height: 222, sizeMode: 'sliced' }} />
            <ItemSlot left={489} top={684} itemId={rightId} count={rightCount} detailCount={rightDetail} />
            <image name="RewardObtain/RightSelected" visible={rightSelected} source={SELECTED}
                style={{ position: 'absolute', left: 462, top: 650, width: 208, height: 222, sizeMode: 'sliced' }} />
            <text name="RewardObtain/Hint" value={hint}
                style={{ position: 'absolute', left: 0, top: 1354, width: 750, height: 26,
                    font: HINT_FONT, fontSize: 26, color: '#837A91', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
