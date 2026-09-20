import { defineView, useState } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';
import { NotificationBadge } from '../../../components/badge/NotificationBadge';
import { ScreenHeader } from '../../../components/chrome/ScreenHeader';
import { heroListTab, TabBar, type TabBarItem } from '../../../components/tab/TabBar';
import { MainNav, type MainNavSlot } from '../../../gamecomponents/navigation/MainNav';
import { HeroBondsPanel, type HeroBond, type HeroBondMember } from './HeroBondsPanel';
import { HeroListPanel, type HeroCardItem } from './HeroListPanel';

export type HeroScreenTab = 'hero' | 'team' | 'bonds';

const HERO_LIST_TABS: readonly TabBarItem[] = [
    { id: 'hero', label: '英雄' },
    { id: 'team', label: '队伍' },
    { id: 'bonds', label: '羁绊' },
];

export interface HeroScreenParams {
    readonly title?: string;
    readonly cards?: readonly HeroCardItem[];
    readonly bonds?: readonly HeroBond[];
    readonly bondMembers?: readonly HeroBondMember[];
    readonly nav?: MainNavSlot;
    readonly onRecruit?: () => void;
    readonly onSelectCard?: (id: string) => void;
    readonly onSelectBond?: (id: string) => void;
    readonly onBondDetail?: (id: string) => void;
    readonly onNav?: (slot: MainNavSlot) => void;
    readonly onClose?: () => void;
}

const defaultCards: readonly HeroCardItem[] = [
    { id: 'c1', quality: 'red', classId: 'anchor', owned: true, level: 'Lv.20', stars: 1, team: '1' },
    { id: 'c2', quality: 'yellow', classId: 'shield', owned: true, level: 'Lv.18', stars: 2, team: '1' },
    { id: 'c3', quality: 'purple', classId: 'sword', owned: true, level: 'Lv.24', stars: 3, team: '1' },
    { id: 'c4', quality: 'blue', classId: 'shield', owned: true, level: 'Lv.12', stars: 1, team: '2' },
    { id: 'c5', quality: 'green', classId: 'shield', owned: true, level: 'Lv.8', stars: 1 },
    { id: 'c6', quality: 'yellow', classId: 'anchor', owned: true, level: 'Lv.30', stars: 4, team: '2' },
    { id: 'c7', quality: 'purple', classId: 'anchor', owned: false, fragments: '9/10', fillWidth: 99 },
    { id: 'c8', quality: 'purple', classId: 'anchor', owned: false, fragments: '3/10', fillWidth: 33 },
    { id: 'c9', quality: 'purple', classId: 'anchor', owned: false, fragments: '6/10', fillWidth: 66 },
    { id: 'c10', quality: 'blue', classId: 'sword', owned: false, fragments: '1/10', fillWidth: 22 },
    { id: 'c11', quality: 'green', classId: 'sword', owned: false, fragments: '8/10', fillWidth: 88 },
    { id: 'c12', quality: 'red', classId: 'anchor', owned: false, fragments: '5/10', fillWidth: 55 },
    { id: 'c13', quality: 'purple', classId: 'anchor', owned: false, fragments: '2/10', fillWidth: 22 },
    { id: 'c14', quality: 'yellow', classId: 'shield', owned: false, fragments: '7/10', fillWidth: 77 },
    { id: 'c15', quality: 'blue', classId: 'anchor', owned: false, fragments: '4/10', fillWidth: 44 },
    { id: 'c16', quality: 'green', classId: 'sword', owned: false, fragments: '9/10', fillWidth: 99 },
];

const defaultBonds: readonly HeroBond[] = [
    { id: 'bond-gale', name: '疾风双刃', bonus: '英雄攻击+30' },
    { id: 'bond-gold', name: '黄金搭档', bonus: '英雄防御+50' },
    { id: 'bond-sea', name: '深海盟约', bonus: '英雄生命+40' },
    { id: 'bond-flame', name: '烈焰同盟', bonus: '英雄暴击+15' },
    { id: 'bond-shadow', name: '暗影誓约', bonus: '英雄闪避+12' },
];

const defaultBondMembers: readonly HeroBondMember[] = [
    { id: 'm1', quality: 'purple', owned: true, level: 'Lv.99', name: '威尔', nameColor: '#6B38A6' },
    { id: 'm2', quality: 'blue', owned: true, level: 'Lv.76', name: '安娜', nameColor: '#40729E' },
    { id: 'm3', quality: 'yellow', owned: true, level: 'Lv.54', name: '杰克', nameColor: '#976422' },
    { id: 'm4', quality: 'green', owned: false, level: 'Lv.1', name: '莉娜', nameColor: '#298238' },
    { id: 'm5', quality: 'red', owned: false, level: 'Lv.1', name: '布鲁', nameColor: '#B83F3F' },
    { id: 'm6', quality: 'purple', owned: true, level: 'Lv.42', name: '艾拉', nameColor: '#6B38A6' },
    { id: 'm7', quality: 'blue', owned: false, level: 'Lv.1', name: '罗恩', nameColor: '#40729E' },
    { id: 'm8', quality: 'yellow', owned: true, level: 'Lv.21', name: '凯恩', nameColor: '#976422' },
    { id: 'm9', quality: 'green', owned: true, level: 'Lv.15', name: '米娅', nameColor: '#298238' },
];

export const HeroScreen = defineView<HeroScreenParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    const cards = params.cards ?? defaultCards;
    const bonds = params.bonds ?? defaultBonds;
    const members = params.bondMembers ?? defaultBondMembers;
    const [tab, setTab] = useState<HeroScreenTab>('hero');
    const [nav, setNav] = useState<MainNavSlot>(params.nav ?? 'hero');
    const unreadDot = imageRef('ui/mail/unread-dot');
    const selectNav = (slot: MainNavSlot) => {
        setNav(slot);
        params.onNav?.(slot);
    };
    const selectHeroTab = (id: string) => {
        if (id === 'hero' || id === 'team' || id === 'bonds') setTab(id);
    };
    return (
        <view name="HeroScreen" style={{ width: 750, height: 1334, backgroundColor: '#F3EFE9' }}>
            <image visible={tab === 'bonds'} source={imageRef('ui/hero/bond-bg')}
                style={{ position: 'absolute', left: 0, top: -144, width: 750, height: 1624 }} />
            <view visible={tab === 'bonds'}
                style={{ position: 'absolute', left: 0, top: -144, width: 750, height: 1624, backgroundColor: '#00000099' }} />
            <ScreenHeader title={params.title ?? '英雄'} titleLeft={20} />
            <view interaction="press" onClick={() => params.onRecruit?.()}
                style={{ position: 'absolute', left: 518, top: 21, width: 217, height: 51 }}>
                <image source={imageRef('ui/hero/recruit')} style={{ width: 217, height: 51 }} />
            </view>

            <HeroListPanel visible={tab === 'hero'} cards={cards} onSelectCard={params.onSelectCard} />
            <HeroBondsPanel visible={tab === 'bonds'} bonds={bonds} members={members}
                onSelectBond={params.onSelectBond} onBondDetail={params.onBondDetail}
                onSelectMember={params.onSelectCard} />

            <image source={imageRef('ui/hero/tabs-base')}
                style={{ position: 'absolute', left: 34, top: 1122, width: 682, height: 80 }} />
            <TabBar skin={heroListTab} left={34} top={1122} itemWidth={227} gap={0} width={681}
                selected={tab} items={HERO_LIST_TABS} badgeTop={0} onSelect={selectHeroTab} />
            <NotificationBadge mode="dot" visible={tab === 'hero'} source={unreadDot}
                left={236} top={1124} />
            <NotificationBadge mode="dot" visible={tab === 'bonds'} source={unreadDot}
                left={690} top={1124} />

            <MainNav selected={nav} noticeExplore onSelect={selectNav} />
        </view>
    );
});
