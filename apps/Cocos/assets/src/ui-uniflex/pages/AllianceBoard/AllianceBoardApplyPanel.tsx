import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

export interface AllianceBoardApplyPanelProps {
    readonly visible?: boolean;
    readonly emptyText?: string;
}

const GRAY = '#837A91';

export const AllianceBoardApplyPanel = defineComponent<AllianceBoardApplyPanelProps>((p) => (
    <view name="AllianceBoardApply" visible={p.visible !== false}
        style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
        <image source={imageRef('ui/backpack/empty')}
            style={{ position: 'absolute', left: 321, top: 746, width: 108, height: 116 }} />
        <text value={p.emptyText ?? '暂时没有申请记录'}
            style={{ position: 'absolute', left: 50, top: 901, width: 650, height: 40,
                font: fontRef('fonts/regular', 700), fontSize: 40, color: GRAY, bold: true,
                horizontalAlign: 'center', verticalAlign: 'center', overflow: 'shrink' }} />
    </view>
));
