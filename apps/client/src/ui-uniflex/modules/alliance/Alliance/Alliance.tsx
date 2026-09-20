import { defineView, useState } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { MainNav, type MainNavSlot } from '../../../gamecomponents/navigation/MainNav';
import { mailTab, TabBar } from '../../../components/tab/TabBar';
import { AllianceAnnouncePanel } from '../AllianceAnnounce/AllianceAnnouncePanel';
import { AllianceBoardPanel } from '../AllianceBoard/AllianceBoardPanel';
import { AllianceGiftPanel } from '../AllianceGift/AllianceGiftPanel';
import { AllianceTechPanel } from '../AllianceTech/AllianceTechPanel';
import { AllianceHelpPanel } from '../AllianceHelp/AllianceHelpPanel';
import { AllianceInvitePanel } from '../AllianceInvite/AllianceInvitePanel';
import { AllianceMemberSettingsPanel } from '../AllianceMemberSettings/AllianceMemberSettingsPanel';
import { AllianceWarPanel } from '../AllianceWar/AllianceWarPanel';
import { AllianceTerritoryPanel } from '../AllianceTerritory/AllianceTerritoryPanel';
import { AllianceHomePanel } from './AllianceHomePanel';
import { AllianceMembersPanel } from './AllianceMembersPanel';
import { AllianceSettingsPanel } from './AllianceSettingsPanel';

export type AllianceTab = 'home' | 'members' | 'settings';

export interface AllianceParams {
    readonly title?: string;
    readonly tab?: AllianceTab;
    readonly badgeCount?: number;
    readonly tag?: string;
    readonly name?: string;
    readonly leader?: string;
    readonly power?: string;
    readonly memberCount?: string;
    readonly nav?: MainNavSlot;
    readonly onSelectTab?: (tab: AllianceTab) => void;
    readonly onAction?: (id: string) => void;
    readonly onNav?: (slot: MainNavSlot) => void;
}

export const Alliance = defineView<AllianceParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    const [tab, setTab] = useState<AllianceTab>(params.tab ?? 'home');
    const [nav, setNav] = useState<MainNavSlot>(params.nav ?? 'hero');
    const [announceOpen, setAnnounceOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [memberSettingsOpen, setMemberSettingsOpen] = useState(false);
    const [warOpen, setWarOpen] = useState(false);
    const [territoryOpen, setTerritoryOpen] = useState(false);
    const [giftOpen, setGiftOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [boardOpen, setBoardOpen] = useState(false);
    const [techOpen, setTechOpen] = useState(false);
    const selectTab = (next: AllianceTab) => {
        setTab(next);
        params.onSelectTab?.(next);
    };
    const selectNav = (slot: MainNavSlot) => {
        setNav(slot);
        params.onNav?.(slot);
    };
    const onAction = (id: string) => {
        if (id === 'edit_announcement') setAnnounceOpen(true);
        if (id === 'open_invite') setInviteOpen(true);
        if (id === 'open_member_config') setMemberSettingsOpen(true);
        if (id === 'open_war') setWarOpen(true);
        if (id === 'open_territory') setTerritoryOpen(true);
        if (id === 'open_gift' || id === 'open_mailgift') setGiftOpen(true);
        if (id === 'open_help') setHelpOpen(true);
        if (id === 'open_list' || id === 'open_list_dup') setBoardOpen(true);
        if (id === 'open_tech') setTechOpen(true);
        params.onAction?.(id);
    };
    const badgeCount = params.badgeCount ?? 3;
    const tabItems = [
        { id: 'home', label: '联盟' },
        { id: 'members', label: '成员', badge: tab === 'members' ? 0 : badgeCount },
        { id: 'settings', label: '设置', badge: tab === 'members' ? badgeCount : 0 },
    ];
    const selectBarTab = (id: string) => {
        if (id === 'home' || id === 'members' || id === 'settings') selectTab(id);
    };
    return (
        <view name="Alliance" style={{ width: 750, height: 1624 }}>
            <image source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <view style={{ position: 'absolute', left: 0, top: 140, width: 750, height: 209, backgroundColor: '#553E78' }} />
            <view style={{ position: 'absolute', left: 0, top: 314, width: 750, height: 1310, backgroundColor: '#F3EFE9' }} />

            <AllianceHomePanel visible={tab === 'home'} tag={params.tag} name={params.name}
                leader={params.leader} power={params.power} memberCount={params.memberCount}
                onAction={onAction} />
            <AllianceMembersPanel visible={tab === 'members'} onAction={onAction} />
            <AllianceSettingsPanel visible={tab === 'settings'} tag={params.tag} name={params.name}
                leader={params.leader} power={params.power} memberCount={params.memberCount}
                onAction={onAction} />

            <ScreenHeader title={params.title ?? '联盟'} top={144} titleLeft={20} />

            <TabBar skin={mailTab} left={13} top={262} itemWidth={200} width={737} selected={tab} items={tabItems}
                onSelect={selectBarTab} />

            <MainNav selected={nav} noticeExplore onSelect={selectNav} />
            <AllianceAnnouncePanel visible={announceOpen} onClose={() => setAnnounceOpen(false)} />
            <AllianceInvitePanel visible={inviteOpen} onClose={() => setInviteOpen(false)}
                onSearch={(query) => params.onAction?.(`search_player:${query}`)}
                onInvite={() => params.onAction?.('invite_selected')}
                onPublicInvite={() => params.onAction?.('invite_public')} />
            <AllianceMemberSettingsPanel visible={memberSettingsOpen} onClose={() => setMemberSettingsOpen(false)} />
            <AllianceWarPanel visible={warOpen} onBack={() => setWarOpen(false)}
                onAction={params.onAction} />
            <AllianceTerritoryPanel visible={territoryOpen} onBack={() => setTerritoryOpen(false)}
                onAction={params.onAction} />
            <AllianceGiftPanel visible={giftOpen} onBack={() => setGiftOpen(false)}
                onAction={params.onAction} onClaimAll={() => params.onAction?.('claim_all')} />
            <AllianceHelpPanel visible={helpOpen} onClose={() => setHelpOpen(false)}
                onAction={params.onAction} onCreate={() => params.onAction?.('create')} />
            <AllianceBoardPanel visible={boardOpen} onBack={() => setBoardOpen(false)}
                onAction={params.onAction} onSend={(text) => params.onAction?.(`send_message:${text}`)} />
            <AllianceTechPanel visible={techOpen} onBack={() => setTechOpen(false)}
                onAction={params.onAction} />
        </view>
    );
});
