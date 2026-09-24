import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import type { BattleLogRow, BattleLogRound } from './battleLogData';
import { BattleLogText } from './BattleLogText';

export const BattleLogSection = defineComponent<{ readonly row: BattleLogRow; readonly onToggle: () => void }>((p) => {
    const row = p.row;
    const height = row.height;
    const isRound = row.round !== null;
    const bodyTop = isRound ? 54 : 52;
    const bodyHeight = row.bodyHeight;
    const arrowRotation = row.expanded ? 'rot:180' : 'rot:0';
    return <view name="BattleLog/Section" style={{ position: 'relative', width: 660, height: height }}>
        <view visible={row.expanded} style={{ position: 'absolute', left: 4, top: bodyTop, width: 652, height: bodyHeight }}>
            <BattleLogBody height={bodyHeight} />
            <BattleLogText runs={row.runs} top={0} height={bodyHeight} />
            <BattleLogRoundBody round={row.round} />
        </view>
        <view name="BattleLog/SectionHeader" visible={!isRound} style={{ position: 'absolute', left: 4, width: 652, height: 52 }}>
            <image source={imageRef('ui/mail-battle-log/section-header')} style={{ position: 'absolute', width: 652, height: 52 }} />
            <text value={row.title} style={{ position: 'absolute', left: 13, width: 550, height: 52,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254', verticalAlign: 'center' }} />
            <image name={arrowRotation} source={imageRef('ui/mail-battle-log/section-arrow')}
                style={{ position: 'absolute', left: 608, top: 15, width: 34, height: 22 }} />
            {/* Keep artwork static; a transparent input mask uses the host's no-feedback path. */}
            <view name="BattleLog/SectionHeader/HitMask" interaction="press" onClick={p.onToggle}
                accessibilityLabel={row.title} style={{ position: 'absolute', width: '100%', height: '100%' }} />
        </view>
        <view name="BattleLog/RoundHeader" visible={isRound} style={{ position: 'absolute', left: 4, width: 652, height: 54, backgroundColor: '#F6F1EA' }}>
            <text value={row.title} style={{ position: 'absolute', left: 13, width: 190, height: 54,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', verticalAlign: 'center' }} />
            <text value="剩余生命值" style={{ position: 'absolute', left: 234, width: 166, height: 54,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
            <text value="生命值损伤" style={{ position: 'absolute', left: 416, width: 166, height: 54,
                font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
            <view style={{ position: 'absolute', left: 3, bottom: 0, width: 646, height: 3, backgroundColor: '#DDD9D4' }} />
            <view name="BattleLog/RoundHeader/HitMask" interaction="press" onClick={p.onToggle}
                accessibilityLabel={row.title} style={{ position: 'absolute', width: '100%', height: '100%' }} />
        </view>
    </view>;
});

/** Primitive fills keep the body color independent from the exported header skin. */
export const BattleLogBody = defineComponent<{ readonly height: number }>((p) => {
    const height = p.height;
    const mainHeight = height - 6;
    return <view style={{ position: 'absolute', width: 652, height: height }}>
        <view style={{ position: 'absolute', width: 652, height: mainHeight, backgroundColor: '#F6F1EA' }} />
        <view style={{ position: 'absolute', left: 2, bottom: 2, width: 648, height: 4, backgroundColor: '#F6F1EA' }} />
        <view style={{ position: 'absolute', left: 5, bottom: 0, width: 642, height: 2, backgroundColor: '#F6F1EA' }} />
    </view>;
});

export const BattleLogRoundBody = defineComponent<{ readonly round: BattleLogRound | null }>((p) => {
    const round = p.round;
    const height = round ? 113 + round.eventHeight : 0;
    const eventHeight = round?.eventHeight ?? 0;
    return <view name="BattleLog/RoundBody" visible={round !== null} style={{ position: 'absolute', width: 652, height: height }}>
        <text value="【我方】" style={{ position: 'absolute', left: 13, top: 4, width: 180, height: 40, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', verticalAlign: 'center' }} />
        <text value="【敌方】" style={{ position: 'absolute', left: 13, top: 42, width: 180, height: 40, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', verticalAlign: 'center' }} />
        <text value={round?.playerHp ?? ''} style={{ position: 'absolute', left: 275, top: 4, width: 120, height: 40, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={round?.enemyHp ?? ''} style={{ position: 'absolute', left: 275, top: 42, width: 120, height: 40, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={round?.playerLoss ?? ''} style={{ position: 'absolute', left: 475, top: 4, width: 120, height: 40, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={round?.enemyLoss ?? ''} style={{ position: 'absolute', left: 475, top: 42, width: 120, height: 40, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view style={{ position: 'absolute', left: 3, top: 88, width: 646, height: 3, backgroundColor: '#DDD9D4' }} />
        <BattleLogText runs={round?.events ?? []} top={93} height={eventHeight} fontSize={26} />
    </view>;
});
