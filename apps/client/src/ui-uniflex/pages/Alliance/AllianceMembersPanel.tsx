import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { AllianceRankGroup, type AllianceRankMember } from './AllianceRankGroup';

export interface AllianceMembersPanelProps {
    readonly visible?: boolean;
    readonly power?: string;
    readonly slots?: readonly string[];
    readonly r5?: readonly AllianceRankMember[];
    readonly r4?: readonly AllianceRankMember[];
    readonly r3?: readonly AllianceRankMember[];
    readonly onAction?: (id: string) => void;
}

const defaultR5: readonly AllianceRankMember[] = [
    { id: 'r5-0', power: '5000', combat: '5000', status: '[1天之前]', online: false },
    { id: 'r5-1', power: '352', combat: '9999', status: '[1天之前]', online: false },
];
const defaultR4: readonly AllianceRankMember[] = [
    { id: 'r4-0', power: '5000', combat: '5000', status: '在线', online: true },
    { id: 'r4-1', power: '352', combat: '9999', status: '[1天之前]', online: false },
];
const defaultR3: readonly AllianceRankMember[] = [
    { id: 'r3-0', power: '5000', combat: '5000', status: '[1天之前]', online: false },
    { id: 'r3-1', power: '352', combat: '5000', status: '[1天之前]', online: false },
];

export const AllianceMembersPanel = defineComponent<AllianceMembersPanelProps>((p) => {
    const [openR5, setOpenR5] = useState(true);
    const [openR4, setOpenR4] = useState(true);
    const [openR3, setOpenR3] = useState(true);
    const slots = p.slots ?? ['炮手', '先锋', '队长', '枪手'];
    return (
        <view name="AllianceMembers" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
            <view interaction="press" onClick={() => p.onAction?.('open_member_notice')}
                style={{ position: 'absolute', left: 687, top: 329, width: 50, height: 50 }}>
                <image source={imageRef('ui/alliance/alert')} style={{ width: 50, height: 50 }} />
            </view>
            <image source={imageRef('ui/alliance/leader-avatar')}
                style={{ position: 'absolute', left: 308, top: 359, width: 134, height: 137 }} />
            <text value="盟主"
                style={{ position: 'absolute', left: 347, top: 468, width: 55, height: 26,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: '#ffffff', bold: true,
                    outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
            <image source={imageRef('ui/alliance/power-bar')}
                style={{ position: 'absolute', left: 254, top: 502, width: 242, height: 48, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/power-medal')}
                style={{ position: 'absolute', left: 250, top: 503, width: 37, height: 47 }} />
            <text value={p.power ?? '50000'}
                style={{ position: 'absolute', left: 292, top: 508, width: 180, height: 36,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: '#3F3254', bold: true,
                    horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view interaction="press" onClick={() => p.onAction?.('slot_0')}
                style={{ position: 'absolute', left: 95, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[0] ?? '炮手'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => p.onAction?.('slot_1')}
                style={{ position: 'absolute', left: 246, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[1] ?? '先锋'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => p.onAction?.('slot_2')}
                style={{ position: 'absolute', left: 397, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[2] ?? '队长'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => p.onAction?.('slot_3')}
                style={{ position: 'absolute', left: 548, top: 578, width: 107, height: 140 }}>
                <image source={imageRef('ui/alliance/slot-empty')} style={{ width: 107, height: 109 }} />
                <text value={slots[3] ?? '枪手'}
                    style={{ position: 'absolute', left: 0, top: 111, width: 107, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: '#3F3254', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <image source={imageRef('ui/alliance/list-panel')}
                style={{ position: 'absolute', left: 24, top: 725, width: 703, height: 624, sizeMode: 'sliced' }} />
            <view style={{ position: 'absolute', left: 24, top: 725, width: 703, height: 624 }}>
                <AllianceRankGroup top={7} rank="R5" rankColor="#EF4B4B" expanded={openR5}
                    members={p.r5 ?? defaultR5} onToggle={() => setOpenR5(!openR5)} />
                <AllianceRankGroup top={247} rank="R4" rankColor="#CD7443" expanded={openR4}
                    members={p.r4 ?? defaultR4} onToggle={() => setOpenR4(!openR4)} />
                <AllianceRankGroup top={487} rank="R3" rankColor="#A558C1" expanded={openR3}
                    members={p.r3 ?? defaultR3} onToggle={() => setOpenR3(!openR3)} />
            </view>
        </view>
    );
});
