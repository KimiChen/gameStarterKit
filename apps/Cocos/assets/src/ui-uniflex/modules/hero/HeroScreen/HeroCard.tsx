import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef, type ImageRef } from '../../../../kits/uniflex/api/core/index';
import { ProgressBar } from '../../../components/progress/ProgressBar';
import { heroProgress } from '../../../components/progress/progressBarSkins';
import { STAR_ROW_HEIGHT, STAR_ROW_WIDTH, StarRow } from '../../../gamecomponents/star/StarRow';

/** 卡牌星槽宽 155。整排 411 按中心缩到槽内，视觉落在 left 8、top 205。 */
const CARD_STAR_SCALE = 0.377;
const CARD_STAR_LEFT = -120;
const CARD_STAR_TOP = 185;

export type HeroCardQuality = 'purple' | 'green' | 'red' | 'yellow' | 'blue';
export type HeroCardClass = 'shield' | 'sword' | 'anchor';

export interface HeroCardProps {
    readonly quality: HeroCardQuality;
    readonly classId: HeroCardClass;
    readonly portrait?: ImageRef;
    readonly owned: boolean;
    readonly level?: string;
    readonly fragments?: string;
    readonly fillWidth?: number;
    readonly stars?: number;
    readonly team?: string;
    readonly onClick?: () => void;
}

export const HeroCard = defineComponent<HeroCardProps>((p) => {
    const quality = p.quality;
    const classId = p.classId;
    const owned = p.owned;
    const framePurple = imageRef('ui/hero/frame-purple');
    const frameGreen = imageRef('ui/hero/frame-green');
    const frameRed = imageRef('ui/hero/frame-red');
    const frameYellow = imageRef('ui/hero/frame-yellow');
    const frameBlue = imageRef('ui/hero/frame-blue');
    const frame = quality === 'purple' ? framePurple
        : quality === 'red' ? frameRed
        : quality === 'yellow' ? frameYellow
        : quality === 'blue' ? frameBlue
        : frameGreen;
    const classShield = imageRef('ui/hero/class-shield');
    const classSword = imageRef('ui/hero/class-sword');
    const classAnchor = imageRef('ui/hero/class-anchor');
    const classIcon = classId === 'sword' ? classSword : classId === 'anchor' ? classAnchor : classShield;
    const stars = p.stars ?? 0;
    const fillWidth = p.fillWidth ?? 99;
    const fragments = p.fragments ?? '9/10';
    const unowned = !owned;
    const level = p.level ?? 'Lv.20';
    const team = p.team ?? '';
    const showTeam = owned && p.team != null && p.team !== '';
    return (
    <view name="HeroCard" interaction="press" onClick={p.onClick}
        style={{ position: 'relative', width: 170, height: 248 }}>
        <image source={frame}
            style={{ position: 'absolute', width: 170, height: 248 }} />
        <image source={p.portrait ?? imageRef('ui/hero/portrait')}
            style={{ position: 'absolute', left: 4, top: 4, width: 162, height: 180 }} />
        <image source={classIcon}
            style={{ position: 'absolute', left: 6, top: 6, width: 34, height: 42 }} />
        <image visible={!owned} source={imageRef('ui/hero/unowned')}
            style={{ position: 'absolute', left: 2, top: 0, width: 166, height: 244 }} />
        <ProgressBar visible={unowned} left={23} top={207} width={124} height={26}
            skin={heroProgress} fillWidth={fillWidth}
            label={fragments} labelSize={22} />
        <text visible={owned} value={level}
            style={{ position: 'absolute', left: 10, top: 168, width: 110, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 28, color: '#ffffff', bold: true,
                outlineColor: '#000000', outlineWidth: 2, horizontalAlign: 'right', verticalAlign: 'center' }} />
        <image visible={owned} source={imageRef('ui/hero/upgrade')}
            style={{ position: 'absolute', left: 126, top: 167, width: 39, height: 38 }} />
        <view visible={owned} style={{ position: 'absolute', left: CARD_STAR_LEFT, top: CARD_STAR_TOP, width: STAR_ROW_WIDTH, height: STAR_ROW_HEIGHT, scale: CARD_STAR_SCALE }}>
            <StarRow value={stars} />
        </view>
        <view visible={showTeam} style={{ position: 'absolute', left: 127, top: 0, width: 35, height: 44 }}>
            <image source={imageRef('ui/hero/team-short')} style={{ position: 'absolute', width: 35, height: 44 }} />
            <text value={team} style={{ position: 'absolute', width: 35, height: 32,
                font: fontRef('fonts/regular', 700), fontSize: 22, color: '#ffffff', bold: true,
                outlineColor: '#806241', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
    </view>
    );
});
