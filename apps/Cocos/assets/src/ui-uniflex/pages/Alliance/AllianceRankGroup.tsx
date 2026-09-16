import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { AllianceMemberRow, type AllianceMemberRowProps } from './AllianceMemberRow';

export interface AllianceRankMember extends Omit<AllianceMemberRowProps, 'visible' | 'left' | 'top'> {
    readonly id: string;
}

export interface AllianceRankGroupProps {
    readonly top: number;
    readonly rank: string;
    readonly rankColor: string;
    readonly count?: string;
    readonly expanded?: boolean;
    readonly members: readonly AllianceRankMember[];
    readonly onToggle?: () => void;
}

export const AllianceRankGroup = defineComponent<AllianceRankGroupProps>((p) => (
    <view name="AllianceRankGroup" style={{ position: 'absolute', left: 0, top: p.top, width: 703, height: 238 }}>
        <view interaction="press" onClick={() => p.onToggle?.()}
            style={{ position: 'absolute', left: 6, top: 0, width: 690, height: 65 }}>
            <image source={imageRef('ui/alliance/rank-header')}
                style={{ position: 'absolute', width: 690, height: 65, sizeMode: 'sliced' }} />
            <text value={p.rank}
                style={{ position: 'absolute', left: 22, top: 0, width: 40, height: 65,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: p.rankColor, bold: true, verticalAlign: 'center' }} />
            <text value={p.count ?? '(0/1)'}
                style={{ position: 'absolute', left: 58, top: 0, width: 120, height: 65,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
            <image source={imageRef('ui/alliance/rank-arrow')}
                style={{ position: 'absolute', left: 632, top: 20, width: 40, height: 26 }} />
        </view>
        <AllianceMemberRow visible={p.expanded !== false && !!p.members[0]} left={21} top={70}
            power={p.members[0]?.power} combat={p.members[0]?.combat}
            status={p.members[0]?.status} online={p.members[0]?.online} />
        <AllianceMemberRow visible={p.expanded !== false && !!p.members[1]} left={21} top={154}
            power={p.members[1]?.power} combat={p.members[1]?.combat}
            status={p.members[1]?.status} online={p.members[1]?.online} />
    </view>
));
