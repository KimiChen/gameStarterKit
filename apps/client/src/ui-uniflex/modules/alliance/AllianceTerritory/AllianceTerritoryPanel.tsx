import { defineComponent, useState } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { ScreenFooter } from '../../../components/chrome/ScreenFooter';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { flagTab, TabBar } from '../../../components/tab/TabBar';
import { AllianceTerritoryFortPanel } from './AllianceTerritoryFortPanel';
import { AllianceTerritoryLandPanel } from './AllianceTerritoryLandPanel';
import { AllianceTerritoryPortPanel } from './AllianceTerritoryPortPanel';

export type AllianceTerritoryTab = 'land' | 'port' | 'fort';

export interface AllianceTerritoryPanelProps {
    readonly visible?: boolean;
    readonly title?: string;
    readonly tab?: AllianceTerritoryTab;
    readonly onBack?: () => void;
    readonly onAction?: (id: string) => void;
    readonly onSelectTab?: (tab: AllianceTerritoryTab) => void;
}

export const AllianceTerritoryPanel = defineComponent<AllianceTerritoryPanelProps>((p) => {
    const [tab, setTab] = useState<AllianceTerritoryTab>(p.tab ?? 'land');
    const selectTab = (next: AllianceTerritoryTab) => {
        setTab(next);
        p.onSelectTab?.(next);
    };
    const back = () => {
        p.onBack?.();
        p.onAction?.('back');
    };
    const flagBottom = imageRef('ui/alliance/flag-bottom');
    return (
        <view name="AllianceTerritory" visible={p.visible !== false}
            style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <image source={imageRef('ui/alliance/flag-tab-track')}
                style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209 }} />
            <image source={imageRef('ui/alliance/flag-content-bg')}
                style={{ position: 'absolute', left: 0, top: 314, width: 750, height: 1310, sizeMode: 'sliced' }} />
            <ScreenHeader title={p.title ?? '领地旗帜'} top={144} titleTop={169}
                titleWidth={400} titleHeight={50} />

            <AllianceTerritoryLandPanel visible={tab === 'land'} onAction={p.onAction} />
            <AllianceTerritoryPortPanel visible={tab === 'port'} onAction={p.onAction} />
            <AllianceTerritoryFortPanel visible={tab === 'fort'} onAction={p.onAction} />

            <TabBar skin={flagTab} left={14} top={262} itemWidth={170} width={736} selected={tab}
                items={[{ id: 'land', label: '联盟领地' }, { id: 'port', label: '港口' }, { id: 'fort', label: '要塞' }]}
                onSelect={(id) => { if (id === 'land' || id === 'port' || id === 'fort') selectTab(id); }} />

            <ScreenFooter source={flagBottom} backLeft={16} onBack={back} />
        </view>
    );
});
