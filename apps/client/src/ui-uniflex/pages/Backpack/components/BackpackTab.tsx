import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export const BackpackTab = defineComponent<{
    readonly label: string;
    readonly active: boolean;
    readonly left: number;
    readonly onClick?: () => void;
}>((p) => (
    <view name="BackpackTab" interaction="press" onClick={p.onClick}
        style={{ position: 'absolute', left: p.active ? p.left - 3 : p.left, top: p.active ? 103 : 118,
            width: p.active ? 140 : 134, height: p.active ? 67 : 52 }}>
        <image visible={p.active} source={imageRef('ui/mail/tab-active')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={!p.active} source={imageRef('ui/mail/tab-inactive')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: fontRef('fonts/regular', 700), fontSize: p.active ? 32 : 28, color: '#3F3254', bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
