import { defineComponent, useState } from '@uniflex/compiler';
import { imageRef } from '../../../kits/uniflex/api/core/index';
import { ConfirmButton } from '../../components/button/ConfirmButton';
import { CyanButton } from '../../components/button/CyanButton';
import { BackButton } from '../../components/chrome/BackButton';
import { ScreenHeader } from '../../components/chrome/ScreenHeader';
import { PanelTab } from '../../components/tab/PanelTab';

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

            <PanelTab label="集结" active={tab === 'rally'} left={13} top={262} width={200}
                onClick={() => selectTab('rally')} />
            <PanelTab label="战争" active={tab === 'war'} left={227} top={262} width={200}
                onClick={() => selectTab('war')} />
            <PanelTab label="活动" active={tab === 'event'} left={440} top={262} width={200}
                onClick={() => selectTab('event')} />

            <image source={imageRef('ui/mail/footer')}
                style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110, sizeMode: 'sliced' }} />
            <BackButton top={1396} onClick={back} />
            <view style={{ position: 'absolute', left: 111.125, top: 1373.25, width: 255, height: 102, scale: 0.75 }}>
                <CyanButton label="自动集结" onClick={() => p.onAction?.('auto_rally')} />
            </view>
            <view style={{ position: 'absolute', left: 384.125, top: 1373.25, width: 255, height: 102, scale: 0.75 }}>
                <ConfirmButton label="发起集结" onClick={() => p.onAction?.('start_rally')} />
            </view>
        </view>
    );
});
