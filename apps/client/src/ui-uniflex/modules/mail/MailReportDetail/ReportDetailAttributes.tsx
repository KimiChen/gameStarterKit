import { defineComponent, For } from '@uniflex/compiler';
import { fontRef } from '../../../../kits/uniflex/api/core/index';
import { ReportDetailCard, ReportDetailSectionHeading } from './ReportDetailChrome';

interface AttributeRow { readonly id: string; readonly top: number; readonly label: string; readonly disadvantaged: boolean; }
const attributes: readonly AttributeRow[] = [
    { id: 'attack', top: 65, label: '船只总攻击', disadvantaged: false },
    { id: 'defense', top: 123, label: '船只总防御', disadvantaged: true },
    { id: 'health', top: 181, label: '船只总生命', disadvantaged: true },
    { id: 'damage', top: 239, label: '船只总伤害', disadvantaged: false },
];
export const ReportDetailAttributes = defineComponent<{ readonly visible: boolean; readonly onAction?: (action: string) => void }>((p) => (
    <view name="ReportDetailAttributes" visible={p.visible} style={{ position: 'absolute', width: 673, height: 313 }}>
        <ReportDetailCard height={310} />
        <ReportDetailSectionHeading title="属性总览对比" info onInfo={() => p.onAction?.('attribute-info')} />
        <For each={attributes} key="id">{(row) => <ReportDetailAttributeRow row={row} />}</For>
    </view>
));
export const ReportDetailAttributeRow = defineComponent<{ readonly row: AttributeRow }>((p) => {
    const row = p.row;
    const top = row.top;
    const background = row.id === 'defense' || row.id === 'damage' ? '#EAE0CC' : '#FBF8F2';
    const color = row.disadvantaged ? '#FF4B50' : '#3F3254';
    return <view style={{ position: 'absolute', left: 11, top: top, width: 652, height: 58, backgroundColor: background }}>
        <text value="0%" style={{ position: 'absolute', left: 55, width: 95, height: 58, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: color, horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={row.label} style={{ position: 'absolute', left: 180, width: 290, height: 58, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
        <text value={row.disadvantaged ? '' : '0%'} style={{ position: 'absolute', left: 503, width: 95, height: 58, font: fontRef('fonts/regular', 700), bold: true, fontSize: 28, color: '#3F3254', horizontalAlign: 'center', verticalAlign: 'center' }} />
    </view>;
});
