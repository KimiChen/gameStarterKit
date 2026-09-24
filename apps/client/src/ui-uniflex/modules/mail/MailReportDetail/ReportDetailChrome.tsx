import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';
import { ActionButton } from '../../../components/button/ActionButton';

const infoIcon = imageRef('ui/mail-report-detail/info');

/** Coordinates within a 673px content viewport; preserves the source card corners. */
export const ReportDetailCard = defineComponent<{ readonly height: number; readonly top?: number }>((p) => {
    const height = p.height;
    const top = p.top ?? 0;
    return <image source={imageRef('ui/mail-report-detail/card')}
        style={{ position: 'absolute', left: 9, top: top, width: 656, height: height, sizeMode: 'sliced' }} />;
});

export const ReportDetailSectionHeading = defineComponent<{
    readonly title: string;
    readonly power?: string;
    readonly info?: boolean;
    readonly onInfo?: () => void;
}>((p) => (
    <view name="ReportDetailSectionHeading" style={{ position: 'absolute', left: 11, top: 2, width: 652, height: 54 }}>
        <image source={imageRef('ui/mail-report-detail/section-bar')} style={{ position: 'absolute', width: 652, height: 54 }} />
        <image visible={p.power !== undefined} source={imageRef('ui/mail-report-detail/power')}
            style={{ position: 'absolute', left: 7, top: 4, width: 47, height: 44 }} />
        <text visible={p.power !== undefined} value={p.power ?? ''}
            style={{ position: 'absolute', left: 57, top: 4, width: 140, height: 46, font: fontRef('fonts/regular', 700), bold: true,
                fontSize: 32, color: '#FFFFFF', outlineColor: '#15151B', outlineWidth: 2, verticalAlign: 'center' }} />
        <text value={p.title} style={{ position: 'absolute', left: 155, top: 0, width: 340, height: 54,
            font: fontRef('fonts/regular', 700), bold: true, fontSize: 32, color: '#FFFFFF',
            outlineColor: '#15151B', outlineWidth: 2, horizontalAlign: 'center', verticalAlign: 'center' }} />
        <view name="ReportDetail/Info" visible={p.info === true}
            style={{ position: 'absolute', left: 600, top: 5, width: 44, height: 45 }}>
            <ActionButton source={infoIcon} left={0} top={0} width={44} height={45} onClick={p.onInfo} />
        </view>
    </view>
));
