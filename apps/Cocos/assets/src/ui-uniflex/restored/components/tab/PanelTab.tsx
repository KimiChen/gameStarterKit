import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface PanelTabProps {
    readonly label: string;
    readonly active: boolean;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly kind?: 'mail' | 'flag';
    readonly onClick?: () => void;
}

/** Raised window tab shared by mail, backpack and alliance. `left`/`top`/`width` are the unselected chip. */
export const PanelTab = defineComponent<PanelTabProps>((p) => {
    return (
    <view name="PanelTab" interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute',
            left: p.active ? (p.kind === 'flag' ? p.left - 2 : p.left - 3) : p.left,
            top: p.active ? (p.kind === 'flag' ? p.top - 14 : p.top - 15) : p.top,
            width: p.active ? p.width + 6 : p.width, height: p.active ? 67 : 52 }}>
        <image visible={p.active && p.kind !== 'flag'} source={imageRef('ui/mail/tab-active')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={!p.active && p.kind !== 'flag'} source={imageRef('ui/mail/tab-inactive')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={p.active && p.kind === 'flag'} source={imageRef('ui/alliance/flag-tab-selected')}
            style={{ position: 'absolute', width: '100%', height: '100%' }} />
        <image visible={!p.active && p.kind === 'flag'} source={imageRef('ui/alliance/flag-tab-unselected')}
            style={{ position: 'absolute', width: '100%', height: '100%' }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: fontRef('fonts/regular', 700), fontSize: p.active ? 32 : 28, color: '#3F3254', bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
    );
});
