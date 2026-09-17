import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface PanelTabProps {
    readonly label: string;
    readonly active: boolean;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly kind?: 'mail' | 'flag' | 'alliance';
    readonly onClick?: () => void;
}

/** Raised window tab shared by mail, backpack and alliance. `left`/`top`/`width` are the unselected chip. */
export const PanelTab = defineComponent<PanelTabProps>((p) => {
    const flag = p.kind === 'flag';
    const alliance = p.kind === 'alliance';
    const active = p.active;
    const left = active ? (flag ? p.left - 2 : p.left - 3) : p.left;
    const top = active ? (flag ? p.top - 14 : p.top - 15) : p.top;
    const width = active ? p.width + 6 : p.width;
    const fontSize = active ? 32 : 28;
    const height = active ? 67 : 52;
    const mailOn = imageRef('ui/mail/tab-active');
    const mailOff = imageRef('ui/mail/tab-inactive');
    const flagOn = imageRef('ui/alliance/flag-tab-selected');
    const flagOff = imageRef('ui/alliance/flag-tab-unselected');
    const allianceOn = imageRef('ui/alliance/tab-selected');
    const allianceOff = imageRef('ui/alliance/tab-unselected');
    const source = flag ? (active ? flagOn : flagOff)
        : alliance ? (active ? allianceOn : allianceOff)
        : (active ? mailOn : mailOff);
    return (
    <view name="PanelTab" interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', left: left, top: top, width: width, height: height }}>
        <image source={source}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <text value={p.label} style={{ position: 'absolute', width: '100%', height: '100%',
            font: fontRef('fonts/regular', 700), fontSize: fontSize, color: '#3F3254', bold: true,
            horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
    );
});
