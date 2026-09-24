import { defineComponent } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { cyanButton } from '../../../components/button/buttonSkins';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { allianceFlagProgress } from '../../../components/progress/progressBarSkins';

export interface AllianceTerritoryLandCardProps {
    readonly title: string;
    readonly share?: boolean;
    readonly mode: 'peace' | 'build';
    readonly members?: string;
    readonly power?: string;
    readonly peaceText?: string;
    readonly fillWidth?: number;
    readonly onShare?: () => void;
    readonly onGarrison?: () => void;
    readonly onBuild?: () => void;
}

const TITLE = '#ffffff';
const LABEL = '#3F3254';
const VALUE = '#988EA2';
const LINE = 32;
export const LAND_CARD_SIZE = 352;

export const AllianceTerritoryLandCard = defineComponent<AllianceTerritoryLandCardProps>((p) => {
    const fillWidth = p.fillWidth ?? 329;
    return (
        <view name="AllianceTerritoryLandCard" style={{ position: 'relative', width: 750, height: LAND_CARD_SIZE }}>
            <image source={imageRef('ui/alliance/flag-fort-card')}
                style={{ position: 'absolute', left: 16, top: 38, width: 719, height: 297, sizeMode: 'sliced' }} />
            <image source={imageRef('ui/alliance/flag-section-header')}
                style={{ position: 'absolute', left: 15, top: 0, width: 719, height: 64 }} />
            <text value={p.title}
                style={{ position: 'absolute', left: 32, top: 0, width: 520, height: 64,
                    font: fontRef('fonts/regular', 700), fontSize: 28, color: TITLE, bold: true, verticalAlign: 'center' }} />
            <view visible={p.share === true} name="AllianceTerritoryLandCard/Share" interaction="press"
                onClick={() => p.onShare?.()}
                style={{ position: 'absolute', left: 673, top: -1, width: 61, height: 68 }}>
                <image source={imageRef('ui/alliance/flag-share')} style={{ width: 61, height: 68 }} />
            </view>
            <image source={imageRef('ui/alliance/flag-land-thumb')}
                style={{ position: 'absolute', left: 36, top: 76, width: 163, height: 168 }} />
            <image source={imageRef('ui/alliance/flag-building')}
                style={{ position: 'absolute', left: 62, top: 100, width: 111, height: 119 }} />
            <image source={imageRef('ui/alliance/flag-land-stats')}
                style={{ position: 'absolute', left: 210, top: 78, width: 511, height: 96 }} />
            <text value="领地内采集速度"
                style={{ position: 'absolute', left: 222, top: 80, width: 320, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true, verticalAlign: 'center' }} />
            <text value="20%"
                style={{ position: 'absolute', left: 560, top: 80, width: 148, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: VALUE, bold: true,
                    horizontalAlign: 'right', verticalAlign: 'center' }} />
            <text value="领地内行军速度"
                style={{ position: 'absolute', left: 222, top: 112, width: 320, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true, verticalAlign: 'center' }} />
            <text value="20%"
                style={{ position: 'absolute', left: 560, top: 112, width: 148, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: VALUE, bold: true,
                    horizontalAlign: 'right', verticalAlign: 'center' }} />
            <text value="领地内部队伤害提升"
                style={{ position: 'absolute', left: 222, top: 144, width: 320, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true, verticalAlign: 'center' }} />
            <text value="20%"
                style={{ position: 'absolute', left: 560, top: 144, width: 148, height: LINE,
                    font: fontRef('fonts/regular', 700), fontSize: 22, color: VALUE, bold: true,
                    horizontalAlign: 'right', verticalAlign: 'center' }} />

            <view visible={p.mode === 'peace'}>
                <text value="和平"
                    style={{ position: 'absolute', left: 222, top: 189, width: 80, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <text value={p.peaceText ?? '5000/9000'}
                    style={{ position: 'absolute', left: 548, top: 189, width: 174, height: 26,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true,
                        horizontalAlign: 'right', verticalAlign: 'center' }} />
                <ProgressBar left={208} top={214} width={514} height={28}
                    skin={allianceFlagProgress} fillWidth={fillWidth} />
                <view style={{ position: 'absolute', left: 273, top: 248, width: 204, height: 81 }}>
                    <ActionButton skin={cyanButton} label="驻防" width={204} height={81} onClick={() => p.onGarrison?.()} />
                </view>
            </view>

            <view visible={p.mode === 'build'}>
                <image source={imageRef('ui/alliance/flag-icon-person')}
                    style={{ position: 'absolute', left: 221, top: 192, width: 34, height: 30 }} />
                <text value={p.members ?? '21/50'}
                    style={{ position: 'absolute', left: 260, top: 192, width: 160, height: 30,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <image source={imageRef('ui/alliance/flag-icon-power')}
                    style={{ position: 'absolute', left: 445, top: 184, width: 42, height: 38 }} />
                <text value={p.power ?? '162.25M/500m'}
                    style={{ position: 'absolute', left: 492, top: 192, width: 180, height: 30,
                        font: fontRef('fonts/regular', 700), fontSize: 22, color: LABEL, bold: true, verticalAlign: 'center' }} />
                <image source={imageRef('ui/alliance/flag-icon-close')}
                    style={{ position: 'absolute', left: 682, top: 192, width: 28, height: 29 }} />
                <view name="AllianceTerritoryLandCard/Build" interaction="press" onClick={() => p.onBuild?.()}
                    style={{ position: 'absolute', left: 273, top: 246, width: 204, height: 81 }}>
                    <image source={imageRef('ui/alliance/flag-build-button')} style={{ width: 204, height: 81 }} />
                </view>
            </view>
        </view>
    );
});
