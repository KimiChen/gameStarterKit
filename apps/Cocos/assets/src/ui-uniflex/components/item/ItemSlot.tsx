import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../kits/uniflex/api/core/index';

export type ItemQuality = 'green' | 'blue' | 'purple' | 'orange' | 'red';

export interface ItemSlotProps {
    readonly left: number;
    readonly top: number;
    readonly quality: ItemQuality;
    readonly icon: ImageRef;
    readonly count?: string;
}

export const ItemSlot = defineComponent<ItemSlotProps>((p) => {
    const left = p.left;
    const top = p.top;
    const quality = p.quality;
    const frameGreen = imageRef('ui/backpack/item-green');
    const frameBlue = imageRef('ui/backpack/item-blue');
    const framePurple = imageRef('ui/backpack/item-purple');
    const frameOrange = imageRef('ui/backpack/item-orange');
    const frameRed = imageRef('ui/backpack/item-red');
    const frame = quality === 'red' ? frameRed
        : quality === 'orange' ? frameOrange
        : quality === 'purple' ? framePurple
        : quality === 'blue' ? frameBlue
        : frameGreen;
    const icon = p.icon;
    const count = p.count ?? '';
    const showCount = count !== '';
    return (
        <view name="ItemSlot" style={{ position: 'absolute', left: left, top: top, width: 154, height: 159 }}>
            <image source={frame}
                style={{ position: 'absolute', left: 0, top: 0, width: 154, height: 159, sizeMode: 'sliced' }} />
            <image source={icon}
                style={{ position: 'absolute', left: 13, top: 24, width: 129, height: 107 }} />
            <text visible={showCount} value={count}
                style={{ position: 'absolute', left: 87, top: 111, width: 57, height: 42,
                    font: fontRef('fonts/regular', 700), fontSize: 32, color: '#FFFFFF', bold: true,
                    outlineColor: '#000000', outlineWidth: 2,
                    horizontalAlign: 'right', verticalAlign: 'center', overflow: 'shrink' }} />
        </view>
    );
});
