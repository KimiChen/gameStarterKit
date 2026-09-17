import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';

export type ItemQuality = 'green' | 'blue' | 'purple' | 'orange' | 'red';

export interface ItemSlotProps {
    readonly left: number;
    readonly top: number;
    readonly quality: ItemQuality;
    readonly icon?: ImageRef;
    readonly count?: string;
}

/** Shared 154×159 item frame (backpack / shop / hero bond). Icon and count are optional. */
export const ItemSlot = defineComponent<ItemSlotProps>((p) => {
    const quality = p.quality;
    const frame = quality === 'red' ? imageRef('ui/backpack/item-red')
        : quality === 'orange' ? imageRef('ui/backpack/item-orange')
        : quality === 'purple' ? imageRef('ui/backpack/item-purple')
        : quality === 'blue' ? imageRef('ui/backpack/item-blue')
        : imageRef('ui/backpack/item-green');
    const count = p.count ?? '';
    const showCount = count !== '';
    const showIcon = Boolean(p.icon);
    const icon = p.icon ?? imageRef('ui/backpack/diamond');
    return (
        <view name="ItemSlot" style={{ position: 'absolute', left: p.left, top: p.top, width: 154, height: 159 }}>
            <image name="ItemSlot/Frame" source={frame}
                style={{ position: 'absolute', left: 0, top: 0, width: 154, height: 159, sizeMode: 'sliced' }} />
            <image name="ItemSlot/Icon" visible={showIcon} source={icon}
                style={{ position: 'absolute', left: 13, top: 24, width: 129, height: 107 }} />
            <text name="ItemSlot/Count" visible={showCount} value={count}
                style={{ position: 'absolute', left: 87, top: 107, width: 57, height: 42,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#FFFFFF', bold: true,
                    outlineColor: '#000000', outlineWidth: 2,
                    horizontalAlign: 'right', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
