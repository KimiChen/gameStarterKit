import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { PanelTab } from '../../components/tab/PanelTab';
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
            <image source={imageRef('ui/alliance/flag-header')}
                style={{ position: 'absolute', left: 0, top: 144, width: 750, height: 90 }} />
            <text value={p.title ?? '领地旗帜'}
                style={{ position: 'absolute', left: 38, top: 169, width: 400, height: 50,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593D84', outlineWidth: 2, verticalAlign: 'center' }} />

            <AllianceTerritoryLandPanel visible={tab === 'land'} onAction={p.onAction} />
            <AllianceTerritoryPortPanel visible={tab === 'port'} onAction={p.onAction} />
            <AllianceTerritoryFortPanel visible={tab === 'fort'} onAction={p.onAction} />

            <PanelTab kind="flag" label="联盟领地" active={tab === 'land'} left={14} top={262} width={170}
                onClick={() => selectTab('land')} />
            <PanelTab kind="flag" label="港口" active={tab === 'port'} left={198} top={262} width={170}
                onClick={() => selectTab('port')} />
            <PanelTab kind="flag" label="要塞" active={tab === 'fort'} left={382} top={262} width={170}
                onClick={() => selectTab('fort')} />

            <image source={imageRef('ui/alliance/flag-bottom')}
                style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110, sizeMode: 'sliced' }} />
            <view name="AllianceTerritory/Back" interaction="press" onClick={back}
                style={{ position: 'absolute', left: 16, top: 1399, width: 64, height: 56 }}>
                <image source={imageRef('ui/mail/back')} style={{ width: 64, height: 56 }} />
            </view>
        </view>
    );
});
