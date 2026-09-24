import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { SoldierPortrait } from '../../../gamecomponents/soldier/SoldierPortrait';
import { ReportDetailCard, ReportDetailSectionHeading } from './ReportDetailChrome';

const frame = imageRef('ui/mail-report-detail/soldier-l');
const icon = imageRef('ui/mail-report-detail/soldier-icon');
const badge = imageRef('ui/mail-report-detail/dot');

export const ReportDetailSoldiers = defineComponent<{ readonly visible: boolean; readonly onAction?: (action: string) => void }>((p) => (
    <view name="ReportDetailSoldiers" visible={p.visible} style={{ position: 'absolute', width: 673, height: 218 }}>
        <ReportDetailCard height={202} />
        <ReportDetailSectionHeading title="士兵对比" info onInfo={() => p.onAction?.('soldier-info')} />
        <SoldierPortrait left={21} top={73} frame={frame} icon={icon}
            badge={badge} tier={1} onClick={() => p.onAction?.('soldier:player')} />
        <SoldierPortrait left={563} top={73} frame={frame} icon={icon}
            badge={badge} tier={1} onClick={() => p.onAction?.('soldier:enemy')} />
        <image source={imageRef('ui/mail-report-detail/power-xs')} style={{ position: 'absolute', left: 116, top: 74, width: 38, height: 34 }} />
        <image source={imageRef('ui/mail-report-detail/power-xs')} style={{ position: 'absolute', left: 415, top: 74, width: 38, height: 34 }} />
        <text value="154551" style={{ position: 'absolute', left: 155, top: 71, width: 150, height: 44, font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254' }} />
        <text value="154551" style={{ position: 'absolute', left: 454, top: 71, width: 150, height: 44, font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#3F3254' }} />
        <image source={imageRef('ui/mail-report-detail/bar-track')} style={{ position: 'absolute', left: 117, top: 115, width: 439, height: 29 }} />
        <image source={imageRef('ui/mail-report-detail/bar-fill')} style={{ position: 'absolute', left: 119, top: 117, width: 435, height: 25 }} />
        <image source={imageRef('ui/mail-report-detail/bar-fill-red')} style={{ position: 'absolute', left: 462, top: 117, width: 92, height: 25 }} />
        <image source={imageRef('ui/mail-report-detail/bar-seam')} style={{ position: 'absolute', left: 335, top: 117, width: 4, height: 25 }} />
        <text value="160" style={{ position: 'absolute', left: 115, top: 142, width: 100, height: 36, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254' }} />
        <text value="40" style={{ position: 'absolute', left: 455, top: 142, width: 100, height: 36, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'right' }} />
    </view>
));
