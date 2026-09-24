import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ReportDetailCard, ReportDetailSectionHeading } from './ReportDetailChrome';
import { ReportDetailSlots } from './ReportDetailSlots';

export const ReportDetailShips = defineComponent<{ readonly visible: boolean }>((p) => (
    <view name="ReportDetailShips" visible={p.visible} style={{ position: 'absolute', width: 673, height: 268 }}>
        <ReportDetailCard height={258} />
        <ReportDetailSectionHeading title="船只对比" power="154K" />
        <image source={imageRef('ui/mail-report-detail/ship')} style={{ position: 'absolute', left: 23, top: 75, width: 104, height: 75 }} />
        <image source={imageRef('ui/mail-report-detail/ship')} style={{ position: 'absolute', left: 537, top: 75, width: 104, height: 75 }} />
        <image source={imageRef('ui/mail-report-detail/lock')} style={{ position: 'absolute', left: 572, top: 84, width: 43, height: 55 }} />
        <text value="Lv.4" style={{ position: 'absolute', left: 144, top: 68, width: 130, height: 44, font: fontRef('fonts/regular', 700), bold: true, fontSize: 34, color: '#3F3254' }} />
        <text value="核飞艇" style={{ position: 'absolute', left: 144, top: 113, width: 140, height: 37, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254' }} />
        <image source={imageRef('ui/mail-report-detail/vs')} style={{ position: 'absolute', left: 299, top: 86, width: 76, height: 68 }} />
        <image source={imageRef('ui/mail-report-detail/line')} style={{ position: 'absolute', left: 16, top: 160, width: 268, height: 3 }} />
        <image source={imageRef('ui/mail-report-detail/line')} style={{ position: 'absolute', left: 391, top: 160, width: 268, height: 3 }} />
        <ReportDetailSlots ship left={19} top={175} />
        <ReportDetailSlots ship left={364} top={175} />
    </view>
));
