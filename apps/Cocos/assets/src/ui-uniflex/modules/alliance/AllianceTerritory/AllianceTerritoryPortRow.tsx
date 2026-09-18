import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export interface AllianceTerritoryPortRowProps {
    readonly stripe: boolean;
    readonly label: string;
    readonly value: string;
}

const LABEL = '#3F3254';
const VALUE = '#BB9A6E';
export const PORT_ROW_SIZE = 58;

export const AllianceTerritoryPortRow = defineComponent<AllianceTerritoryPortRowProps>((p) => (
    <view name="AllianceTerritoryPortRow" style={{ position: 'relative', width: 719, height: PORT_ROW_SIZE }}>
        <image visible={p.stripe} source={imageRef('ui/alliance/flag-row-stripe')}
            style={{ position: 'absolute', width: 719, height: PORT_ROW_SIZE }} />
        <image source={imageRef('ui/alliance/flag-row-icon')}
            style={{ position: 'absolute', left: 17, top: 3, width: 64, height: 52 }} />
        <text value={p.label}
            style={{ position: 'absolute', left: 90, top: 0, width: 420, height: PORT_ROW_SIZE,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: LABEL, bold: true, verticalAlign: 'center' }} />
        <text value={p.value}
            style={{ position: 'absolute', left: 500, top: 0, width: 200, height: PORT_ROW_SIZE,
                font: fontRef('fonts/regular', 700), fontSize: 24, color: VALUE, bold: true,
                horizontalAlign: 'right', verticalAlign: 'center' }} />
    </view>
));
