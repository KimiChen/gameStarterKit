import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { EmptyState } from '../../components/empty/EmptyState';

export interface AllianceBoardApplyPanelProps {
    readonly visible?: boolean;
    readonly emptyText?: string;
}

export const AllianceBoardApplyPanel = defineComponent<AllianceBoardApplyPanelProps>((p) => {
    const emptyIcon = imageRef('ui/backpack/empty');
    const emptyText = p.emptyText ?? '暂时没有申请记录';
    return (
        <view name="AllianceBoardApply" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1369 }}>
            <EmptyState icon={emptyIcon} left={321} top={746} label={emptyText}
                labelLeft={50} labelTop={901} labelWidth={650} />
        </view>
    );
});
