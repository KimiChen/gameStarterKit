import { defineView, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../../components/badge/NotificationBadge';
import { MainNav, type MainNavSlot } from '../../components/navigation/MainNav';
import { PanelTab } from '../../components/tab/PanelTab';
import { AllianceAnnouncePanel } from '../AllianceAnnounce/AllianceAnnouncePanel';
import { AllianceMemberSettingsPanel } from '../AllianceMemberSettings/AllianceMemberSettingsPanel';
import { AllianceWarPanel } from '../AllianceWar/AllianceWarPanel';
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
    const [memberSettingsOpen, setMemberSettingsOpen] = useState(false);
    const [warOpen, setWarOpen] = useState(false);
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
        if (id === 'open_member_config') setMemberSettingsOpen(true);
        if (id === 'open_war') setWarOpen(true);
        params.onAction?.(id);
    };
    const badge = imageRef('ui/mail/number-badge');
    const badgeCount = params.badgeCount ?? 3;
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

            <image source={imageRef('ui/mail/header')}
                style={{ position: 'absolute', left: 0, top: 144, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={params.title ?? '联盟'}
                style={{ position: 'absolute', left: 20, top: 160, width: 200, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593d84', outlineWidth: 2, verticalAlign: 'center' }} />

            <PanelTab label="联盟" active={tab === 'home'} left={13} top={262} width={200}
                onClick={() => selectTab('home')} />
            <PanelTab label="成员" active={tab === 'members'} left={227} top={262} width={200}
                onClick={() => selectTab('members')} />
            <PanelTab label="设置" active={tab === 'settings'} left={440} top={262} width={200}
                onClick={() => selectTab('settings')} />
            <NotificationBadge count={tab === 'members' ? 0 : badgeCount}
                source={badge} left={401} top={248} />
            <NotificationBadge count={tab === 'members' ? badgeCount : 0}
                source={badge} left={614} top={248} />

            <MainNav selected={nav} noticeExplore onSelect={selectNav} />
            <AllianceAnnouncePanel visible={announceOpen} onClose={() => setAnnounceOpen(false)} />
            <AllianceMemberSettingsPanel visible={memberSettingsOpen} onClose={() => setMemberSettingsOpen(false)} />
            <AllianceWarPanel visible={warOpen} onBack={() => setWarOpen(false)}
                onAction={params.onAction} />
        </view>
    );
});
