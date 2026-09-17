import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../../kits/uniflex/api/core/index';

export const BackpackResourceCounter = defineComponent<{
    readonly id: string;
    readonly value: string;
    readonly left: number;
    readonly onClick?: () => void;
}>((p) => (
    <view name="BackpackResourceCounter" interaction="press" accessibilityLabel={`${p.id} ${p.value}`}
        onClick={p.onClick} style={{ position: 'absolute', left: p.left, top: 22, width: 153, height: 45 }}>
        <image source={imageRef('ui/backpack/resource-bg')}
            style={{ position: 'absolute', left: 7, top: 5, width: 138, height: 32, sizeMode: 'sliced' }} />
        <image source={imageRef('ui/backpack/resource-diamond')}
            style={{ position: 'absolute', left: 4, top: 4, width: 37, height: 31 }} />
        <image source={imageRef('ui/backpack/resource-plus')}
            style={{ position: 'absolute', left: 23, top: 17, width: 20, height: 21 }} />
        <text value={p.value} style={{ position: 'absolute', left: 44, top: 5, width: 101, height: 32,
            font: fontRef('fonts/regular', 700), fontSize: 22, color: '#FFFFFF', bold: true,
            outlineColor: '#000000', outlineWidth: 2, verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
