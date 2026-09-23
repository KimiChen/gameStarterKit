import { defineComponent, useState } from '@uniflex/compiler';
import { ActionButton } from '../../../components/button/ActionButton';
import { confirmButton, cyanButton } from '../../../components/button/buttonSkins';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { TabBar } from '../../../components/tab/TabBar';
import { mailTab } from '../../../components/tab/tabSkins';

export type AllianceWarTab = 'rally' | 'war' | 'event';

export interface AllianceWarPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly tab?: AllianceWarTab;
    readonly onBack?: () => void;
    readonly onAction?: (id: string) => void;
    readonly onSelectTab?: (tab: AllianceWarTab) => void;
}

export const AllianceWarPanel = defineComponent<AllianceWarPanelProps>((p) => {
    const [tab, setTab] = useState<AllianceWarTab>(p.tab ?? 'rally');
    const selectTab = (next: AllianceWarTab) => {
        setTab(next);
        p.onSelectTab?.(next);
    };
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    return (
        <view name="AllianceWar" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 314, width: 750, height: 1310, backgroundColor: '#F3EFE9' }} />

            <ScreenHeader title={p.title ?? '战争'} top={144} titleLeft={41} />

            <TabBar skin={mailTab} left={13} top={262} itemWidth={200} width={737} selected={tab}
                items={[{ id: 'rally', label: '集结' }, { id: 'war', label: '战争' }, { id: 'event', label: '活动' }]}
                onSelect={(id) => { if (id === 'rally' || id === 'war' || id === 'event') selectTab(id); }} />

            <ScreenFooter onBack={back} />
            <view style={{ position: 'absolute', left: 111.125, bottom: 3.75, width: 255, height: 102, scale: 0.75 }}>
                <ActionButton skin={cyanButton} label="自动集结" onClick={() => p.onAction?.('auto_rally')} />
            </view>
            <view style={{ position: 'absolute', left: 384.125, bottom: 3.75, width: 255, height: 102, scale: 0.75 }}>
                <ActionButton skin={confirmButton} label="发起集结" onClick={() => p.onAction?.('start_rally')} />
            </view>
        </view>
    );
});
