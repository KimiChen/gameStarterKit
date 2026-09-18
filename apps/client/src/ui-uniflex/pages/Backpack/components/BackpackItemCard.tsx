import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ItemSlot, type ItemQuality } from '../../../components/item/ItemSlot';

export type BackpackQuality = ItemQuality;
export interface BackpackItem {
    readonly id: string;
    readonly slot: number;
    readonly name: string;
    readonly description: string;
    readonly quality: BackpackQuality;
    readonly count: number;
    readonly detailCount: number;
    readonly maxUseCount: number;
}

export const BackpackItemCard = defineComponent<{
    readonly item: BackpackItem;
    readonly slot: number;
    readonly selected: boolean;
    readonly onClick?: () => void;
}>((p) => {
    const left = 25 + p.slot % 4 * 182;
    const top = p.slot < 4 ? 216 : 407;
    const quality = p.item.quality;
    const count = String(p.item.count);
    const icon = imageRef('ui/backpack/diamond');
    return (
    <view name="BackpackItemCard" interaction="press" accessibilityLabel={`${p.item.name} 数量${p.item.count}`}
        onClick={p.onClick} style={{ position: 'absolute', left: left, top: top, width: 154, height: 159 }}>
        <ItemSlot left={0} top={0} quality={quality} icon={icon} count={count} />
        <image visible={p.selected} source={imageRef('ui/backpack/detail-count-bg')}
            style={{ position: 'absolute', left: 8, top: 8, width: 138, height: 40, sizeMode: 'sliced' }} />
        <text visible={p.selected} value={String(p.item.detailCount)}
            style={{ position: 'absolute', left: 68, top: 7, width: 70, height: 40,
                font: fontRef('fonts/regular', 700), fontSize: 26, color: '#FFFFFF', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center', overflow: 'shrink' }} />
        <image visible={p.selected} source={imageRef('ui/backpack/selection')}
            style={{ position: 'absolute', left: -27, top: -34, width: 208, height: 222, sizeMode: 'sliced' }} />
    </view>
    );
});
