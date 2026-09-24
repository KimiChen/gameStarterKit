import { defineComponent, For } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ReportDetailCard } from './ReportDetailChrome';

interface Casualty { readonly id: string; readonly label: string; readonly left: string; readonly right: string; readonly y: number; readonly shaded: boolean; }
const casualties: readonly Casualty[] = [
    { id: 'troops', label: '部队', left: '500', right: '480', y: 417, shaded: false },
    { id: 'dead', label: '死亡', left: '480', right: '180', y: 475, shaded: true },
    { id: 'critical', label: '重伤', left: '0', right: '300', y: 533, shaded: false },
    { id: 'wounded', label: '轻伤', left: '20', right: '0', y: 591, shaded: true },
    { id: 'remaining', label: '剩余', left: '0', right: '0', y: 649, shaded: false },
];

export const ReportDetailSummary = defineComponent<{ readonly visible: boolean }>((p) => (
    <view name="ReportDetailSummary" visible={p.visible} style={{ position: 'absolute', width: 673, height: 721 }}>
        <ReportDetailCard top={7} height={182} />
        <scroll-view direction="horizontal" style={{ position: 'absolute', left: 11, top: 8, width: 652, height: 178 }}>
            <view style={{ width: 652, height: 178 }}>
                <image source={imageRef('ui/mail-report-detail/victory-banner')}
                    style={{ position: 'absolute', left: -51, top: -8, width: 750, height: 201 }} />
            </view>
        </scroll-view>
        <text value="战斗胜利" style={{ position: 'absolute', left: 15, top: 10, width: 300, height: 52,
            font: fontRef('fonts/regular', 700), fontSize: 40, bold: true, color: '#FFE86B', outlineColor: '#111111', outlineWidth: 3 }} />
        <text value="与Lv.99土匪发生了战斗！" style={{ position: 'absolute', left: 15, top: 61, width: 630, height: 45,
            font: fontRef('fonts/regular', 700), fontSize: 30, bold: true, color: '#3F3254', outlineColor: '#FFFFFF', outlineWidth: 2 }} />
        <ReportDetailCard top={197} height={515} />
        <image source={imageRef('ui/mail-report-detail/result-head')} style={{ position: 'absolute', left: 11, top: 198, width: 652, height: 158 }} />
        <image source={imageRef('ui/mail-report-detail/portrait-player')} style={{ position: 'absolute', left: 113, top: 215, width: 121, height: 123 }} />
        <image source={imageRef('ui/mail-report-detail/portrait-player')} style={{ position: 'absolute', left: 439, top: 215, width: 121, height: 123 }} />
        <text value="胜利" style={{ position: 'absolute', left: 271, top: 233, width: 130, height: 48,
            font: fontRef('fonts/regular', 700), fontSize: 32, bold: true, color: '#FFE86B', outlineColor: '#111111', outlineWidth: 3, horizontalAlign: 'center' }} />
        <text value="玩家名字六字" style={{ position: 'absolute', left: 48, top: 343, width: 250, height: 43,
            font: fontRef('fonts/regular', 700), fontSize: 30, bold: true, color: '#3F3254', horizontalAlign: 'center' }} />
        <text value="土匪" style={{ position: 'absolute', left: 374, top: 343, width: 250, height: 43,
            font: fontRef('fonts/regular', 700), fontSize: 30, bold: true, color: '#3F3254', horizontalAlign: 'center' }} />
        <image source={imageRef('ui/mail-report-detail/power-sm')} style={{ position: 'absolute', left: 121, top: 382, width: 36, height: 32 }} />
        <image source={imageRef('ui/mail-report-detail/power-sm')} style={{ position: 'absolute', left: 447, top: 382, width: 36, height: 32 }} />
        <text value="-0" style={{ position: 'absolute', left: 159, top: 382, width: 130, height: 38,
            font: fontRef('fonts/regular', 700), fontSize: 32, bold: true, color: '#FF4B50' }} />
        <text value="-500" style={{ position: 'absolute', left: 485, top: 382, width: 130, height: 38,
            font: fontRef('fonts/regular', 700), fontSize: 32, bold: true, color: '#FF4B50' }} />
        <For each={casualties} key="id">{(row) => <ReportDetailCasualty row={row} />}</For>
    </view>
));

export const ReportDetailCasualty = defineComponent<{ readonly row: Casualty }>((p) => {
    const row = p.row;
    const top = row.y;
    return <view name="ReportDetail/Casualty" style={{ position: 'absolute', left: 11, top: top, width: 652, height: 58 }}>
                <view visible={row.shaded} style={{ position: 'absolute', width: 652, height: 58, backgroundColor: '#EAE0CC' }} />
                <text value={row.left} style={{ position: 'absolute', left: 56, width: 214, height: 58, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
                <text value={row.label} style={{ position: 'absolute', left: 249, width: 154, height: 58, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
                <text value={row.right} style={{ position: 'absolute', left: 382, width: 214, height: 58, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>;
});
