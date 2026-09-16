import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { AllianceMemberRow, type AllianceMemberRowProps } from './AllianceMemberRow';

export interface AllianceRankMember extends Omit<AllianceMemberRowProps, 'visible'> {
    readonly id: string;
}

export interface AllianceRankGroupProps {
    readonly height: number;
    readonly isHeader: boolean;
    readonly rank: string;
    readonly rankColor: string;
    readonly count: string;
    readonly expanded: boolean;
    readonly power: string;
    readonly combat: string;
    readonly status: string;
    readonly online: boolean;
    readonly onToggle?: () => void;
}

export const HEADER_HEIGHT = 65;
export const ROW_STEP = 84;

export const AllianceRankGroup = defineComponent<AllianceRankGroupProps>((p) => (
    <view name="AllianceRankGroup" style={{ width: 703, height: p.height }}>
        <view visible={p.isHeader} interaction="press" onClick={() => p.onToggle?.()}
            style={{ position: 'absolute', left: 6, top: 0, width: 690, height: HEADER_HEIGHT }}>
            <image source={imageRef('ui/alliance/rank-header')}
                style={{ position: 'absolute', width: 690, height: HEADER_HEIGHT, sizeMode: 'sliced' }} />
            <text value={p.rank}
                style={{ position: 'absolute', left: 22, top: 0, width: 40, height: HEADER_HEIGHT,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: p.rankColor, bold: true, verticalAlign: 'center' }} />
            <text value={p.count}
                style={{ position: 'absolute', left: 58, top: 0, width: 120, height: HEADER_HEIGHT,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: '#3F3254', bold: true, verticalAlign: 'center' }} />
            <image visible={p.expanded} source={imageRef('ui/alliance/rank-arrow')}
                style={{ position: 'absolute', left: 632, top: 20, width: 40, height: 26 }} />
            <image visible={!p.expanded} source={imageRef('ui/alliance/rank-arrow-down')}
                style={{ position: 'absolute', left: 632, top: 20, width: 40, height: 26 }} />
        </view>
        <view visible={!p.isHeader}
            style={{ position: 'absolute', left: 21, top: 0, width: 661, height: 78 }}>
            <AllianceMemberRow power={p.power} combat={p.combat} status={p.status} online={p.online} />
        </view>
    </view>
));
