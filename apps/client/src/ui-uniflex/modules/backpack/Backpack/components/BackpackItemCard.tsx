import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../../kits/uniflex/api/core/index';
import { ItemSlot } from '../../../../gamecomponents/item/ItemSlot';

export type BackpackQuality = string;
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
    /** Legacy Restored callers still provide this; original page uses VirtualList order. */
    readonly slot?: number;
    readonly selected: boolean;
    readonly onClick?: () => void;
}>((p) => {
    const count = String(p.item.count);
    return (
    <view name="BackpackItemCard" interaction="press" accessibilityLabel={`${p.item.name} 数量${p.item.count}`}
        onClick={p.onClick} style={{ position: 'relative', width: 154, height: 159 }}>
        <ItemSlot left={0} top={0} itemId={p.item.id} count={count} />
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
