import { defineView, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../../components/badge/NotificationBadge';
import { type MainNavSlot } from '../../components/navigation/MainNav';
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
    const selectTab = (next: AllianceTab) => {
        setTab(next);
        params.onSelectTab?.(next);
    };
    const selectNav = (slot: MainNavSlot) => {
        setNav(slot);
        params.onNav?.(slot);
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
                onAction={params.onAction} />
            <AllianceMembersPanel visible={tab === 'members'} onAction={params.onAction} />
            <AllianceSettingsPanel visible={tab === 'settings'} tag={params.tag} name={params.name}
                leader={params.leader} power={params.power} memberCount={params.memberCount}
                onAction={params.onAction} />

            <image source={imageRef('ui/mail/header')}
                style={{ position: 'absolute', left: 0, top: 144, width: 750, height: 90, sizeMode: 'sliced' }} />
            <text value={params.title ?? '联盟'}
                style={{ position: 'absolute', left: 20, top: 160, width: 200, height: 58,
                    font: fontRef('fonts/regular', 700), fontSize: 40, color: '#ffffff', bold: true,
                    outlineColor: '#593d84', outlineWidth: 2, verticalAlign: 'center' }} />

            <image visible={tab !== 'home'} source={imageRef('ui/alliance/tab-unselected')}
                style={{ position: 'absolute', left: 13, top: 262, width: 200, height: 52 }} />
            <image visible={tab !== 'members'} source={imageRef('ui/alliance/tab-unselected')}
                style={{ position: 'absolute', left: 227, top: 262, width: 200, height: 52 }} />
            <image visible={tab !== 'settings'} source={imageRef('ui/alliance/tab-unselected')}
                style={{ position: 'absolute', left: 440, top: 262, width: 200, height: 52 }} />
            <image visible={tab === 'home'} source={imageRef('ui/alliance/tab-selected')}
                style={{ position: 'absolute', left: 10, top: 247, width: 206, height: 67 }} />
            <image visible={tab === 'members'} source={imageRef('ui/alliance/tab-selected')}
                style={{ position: 'absolute', left: 224, top: 247, width: 206, height: 67 }} />
            <image visible={tab === 'settings'} source={imageRef('ui/alliance/tab-selected')}
                style={{ position: 'absolute', left: 437, top: 247, width: 206, height: 67 }} />
            <view interaction="press" onClick={() => selectTab('home')}
                style={{ position: 'absolute', left: 10, top: 247, width: 206, height: 67 }}>
                <text value="联盟"
                    style={{ position: 'absolute', left: 3, top: 15, width: 200, height: 52,
                        font: fontRef('fonts/regular', 700), fontSize: 28,
                        color: tab === 'home' ? '#3F3254' : '#ffffff', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => selectTab('members')}
                style={{ position: 'absolute', left: 224, top: 247, width: 206, height: 67 }}>
                <text value="成员"
                    style={{ position: 'absolute', left: 3, top: 15, width: 200, height: 52,
                        font: fontRef('fonts/regular', 700), fontSize: 28,
                        color: tab === 'members' ? '#3F3254' : '#ffffff', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <view interaction="press" onClick={() => selectTab('settings')}
                style={{ position: 'absolute', left: 437, top: 247, width: 206, height: 67 }}>
                <text value="设置"
                    style={{ position: 'absolute', left: 3, top: 15, width: 200, height: 52,
                        font: fontRef('fonts/regular', 700), fontSize: 28,
                        color: tab === 'settings' ? '#3F3254' : '#ffffff', bold: true,
                        horizontalAlign: 'center', verticalAlign: 'center' }} />
            </view>
            <NotificationBadge count={tab === 'members' ? 0 : badgeCount}
                source={badge} left={401} top={248} />
            <NotificationBadge count={tab === 'members' ? badgeCount : 0}
                source={badge} left={614} top={248} />

            <view name="Alliance/Nav" style={{ position: 'absolute', left: 0, top: 1354, width: 750, height: 125 }}>
                <image source={imageRef('ui/hero/nav-base')}
                    style={{ position: 'absolute', left: 0, top: 15, width: 750, height: 110 }} />
                <image visible={nav === 'wheel'} source={imageRef('ui/hero/nav-selected')}
                    style={{ position: 'absolute', left: -2, top: 15, width: 154, height: 110 }} />
                <image visible={nav === 'island'} source={imageRef('ui/hero/nav-selected')}
                    style={{ position: 'absolute', left: 148, top: 15, width: 154, height: 110 }} />
                <image visible={nav === 'hero'} source={imageRef('ui/hero/nav-selected')}
                    style={{ position: 'absolute', left: 298, top: 15, width: 154, height: 110 }} />
                <image visible={nav === 'explore'} source={imageRef('ui/hero/nav-selected')}
                    style={{ position: 'absolute', left: 448, top: 15, width: 154, height: 110 }} />
                <image visible={nav === 'ship'} source={imageRef('ui/hero/nav-selected')}
                    style={{ position: 'absolute', left: 598, top: 15, width: 154, height: 110 }} />
                <view interaction="press" onClick={() => selectNav('wheel')}
                    style={{ position: 'absolute', left: 0, top: 0, width: 150, height: 125 }}>
                    <image source={imageRef('ui/hero/nav-wheel')}
                        style={{ position: 'absolute', left: 28, top: 28, width: 90, height: 84 }} />
                </view>
                <view interaction="press" onClick={() => selectNav('island')}
                    style={{ position: 'absolute', left: 150, top: 0, width: 150, height: 125 }}>
                    <image source={imageRef('ui/hero/nav-island')}
                        style={{ position: 'absolute', left: 30, top: 28, width: 95, height: 83 }} />
                </view>
                <view interaction="press" onClick={() => selectNav('hero')}
                    style={{ position: 'absolute', left: 300, top: 0, width: 150, height: 125 }}>
                    <image source={imageRef('ui/hero/nav-hero')}
                        style={{ position: 'absolute', left: 18, top: 0, width: 115, height: 116 }} />
                </view>
                <view interaction="press" onClick={() => selectNav('explore')}
                    style={{ position: 'absolute', left: 450, top: 0, width: 150, height: 125 }}>
                    <image source={imageRef('ui/hero/nav-wheel')}
                        style={{ position: 'absolute', left: 29, top: 28, width: 90, height: 84 }} />
                </view>
                <view interaction="press" onClick={() => selectNav('ship')}
                    style={{ position: 'absolute', left: 600, top: 0, width: 150, height: 125 }}>
                    <image source={imageRef('ui/hero/nav-ship')}
                        style={{ position: 'absolute', left: 29, top: 22, width: 89, height: 95 }} />
                </view>
                <image source={imageRef('ui/alliance/nav-dot')}
                    style={{ position: 'absolute', left: 560, top: 16, width: 24, height: 24 }} />
            </view>
        </view>
    );
});
