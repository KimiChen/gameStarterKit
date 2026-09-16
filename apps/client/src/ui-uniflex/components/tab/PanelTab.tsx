import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface PanelTabProps {
    readonly label: string;
    readonly active: boolean;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly onClick?: () => void;
}

/** Raised window tab shared by mail, backpack and alliance. `left`/`top`/`width` are the unselected chip. */
export const PanelTab = defineComponent<PanelTabProps>((p) => (
    <view name="PanelTab" interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', left: p.active ? p.left - 3 : p.left, top: p.active ? p.top - 15 : p.top,
            width: p.active ? p.width + 6 : p.width, height: p.active ? 67 : 52 }}>
        <image visible={p.active} source={imageRef('ui/mail/tab-active')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={!p.active} source={imageRef('ui/mail/tab-inactive')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: fontRef('fonts/regular', 700), fontSize: p.active ? 32 : 28, color: '#3F3254', bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
