import { defineComponent, useState } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { mailTab, TabBar } from '../../../components/tab/TabBar';
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

            <ScreenHeader title={p.title ?? '联盟'} top={144} />

            <TabBar skin={mailTab} left={13} top={262} itemWidth={200} width={737} selected={tab}
                items={[{ id: 'board', label: '留言板' }, { id: 'apply', label: '申请列表' }]}
                onSelect={(id) => { if (id === 'board' || id === 'apply') selectTab(id); }} />

            <ScreenFooter onBack={back} />
            <AllianceBoardMessagePanel visible={tab === 'board'} placeholder={p.placeholder}
                onSend={p.onSend} onAction={p.onAction} />
        </view>
    );
});
