import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { PanelTab } from '../../components/tab/PanelTab';
import { AllianceBoardApplyPanel } from './AllianceBoardApplyPanel';
import { AllianceBoardMessagePanel } from './AllianceBoardMessagePanel';

export type AllianceBoardTab = 'board' | 'apply';

export interface AllianceBoardPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly tab?: AllianceBoardTab;
    readonly placeholder?: string;
    readonly emptyText?: string;
    readonly onBack?: () => void;
    readonly onSend?: (text: string) => void;
    readonly onAction?: (id: string) => void;
    readonly onSelectTab?: (tab: AllianceBoardTab) => void;
}

export const AllianceBoardPanel = defineComponent<AllianceBoardPanelProps>((p) => {
    const [tab, setTab] = useState<AllianceBoardTab>(p.tab ?? 'board');
    const selectTab = (next: AllianceBoardTab) => {
        setTab(next);
        p.onSelectTab?.(next);
    };
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    return (
        <view name="AllianceBoard" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 314, width: 750, height: 1310, backgroundColor: '#F3EFE9' }} />

            <AllianceBoardApplyPanel visible={tab === 'apply'} emptyText={p.emptyText} />

            <image source={imageRef('ui/mail/header')}
                style={{ position: 'absolute', left: 0, top: 144, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={p.title ?? '联盟'}
                style={{ position: 'absolute', left: 38, top: 160, width: 200, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />

            <PanelTab label="留言板" active={tab === 'board'} left={13} top={262} width={200}
                onClick={() => selectTab('board')} />
            <PanelTab label="申请列表" active={tab === 'apply'} left={227} top={262} width={200}
                onClick={() => selectTab('apply')} />

            <image source={imageRef('ui/mail/footer')}
                style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110, sizeMode: 'sliced' }} />
            <view name="AllianceBoard/Back" interaction="press" onClick={back}
                style={{ position: 'absolute', left: 13, top: 1396, width: 64, height: 56 }}>
                <image source={imageRef('ui/mail/back')} style={{ width: 64, height: 56 }} />
            </view>
            <AllianceBoardMessagePanel visible={tab === 'board'} placeholder={p.placeholder}
                onSend={p.onSend} onAction={p.onAction} />
        </view>
    );
});
