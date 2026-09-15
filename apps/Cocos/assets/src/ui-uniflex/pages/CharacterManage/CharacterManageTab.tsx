import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export const CharacterManageTab = defineComponent<{
    readonly label: string;
    readonly active: boolean;
    readonly left: number;
    readonly onClick?: () => void;
}>((p) => (
    <view name="CharacterManageTab" interaction="press" onClick={p.onClick}
        style={{ position: 'absolute', left: p.left, top: 102, width: 195, height: 58 }}>
        <image visible={p.active} source={imageRef('ui/character/tab-selected')}
            style={{ position: 'absolute', width: 195, height: 58 }} />
        <image visible={!p.active} source={imageRef('ui/character/tab-unselected')}
            style={{ position: 'absolute', width: 195, height: 58 }} />
        <text value={p.label} style={{ position: 'absolute', width: 195, height: 58,
            font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
