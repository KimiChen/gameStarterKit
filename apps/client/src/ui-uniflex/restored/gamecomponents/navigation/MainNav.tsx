import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

export const MAIN_NAV_SLOTS = ['wheel', 'island', 'hero', 'explore', 'ship'] as const;
export type MainNavSlot = (typeof MAIN_NAV_SLOTS)[number];

export interface MainNavProps {
    readonly selected?: MainNavSlot;
    readonly noticeExplore?: boolean;
    readonly noticeShip?: boolean;
    readonly onSelect?: (slot: MainNavSlot) => void;
}

/** Bottom main nav shared by future screens; this screen currently sits on `hero`. */
export const MainNav = defineComponent<MainNavProps>((p) => {
    const selected = p.selected ?? 'hero';
    return (
        <view name="MainNav" style={{ position: 'absolute', left: 0, bottom: 0, width: 750, height: 125 }}>
            <image source={imageRef('ui/hero/nav-base')}
                style={{ position: 'absolute', left: 0, top: 15, width: 750, height: 110 }} />
            <image visible={selected === 'wheel'} source={imageRef('ui/hero/nav-selected')}
                style={{ position: 'absolute', left: -2, top: 15, width: 154, height: 110 }} />
            <image visible={selected === 'island'} source={imageRef('ui/hero/nav-selected')}
                style={{ position: 'absolute', left: 148, top: 15, width: 154, height: 110 }} />
            <image visible={selected === 'hero'} source={imageRef('ui/hero/nav-selected')}
                style={{ position: 'absolute', left: 298, top: 15, width: 154, height: 110 }} />
            <image visible={selected === 'explore'} source={imageRef('ui/hero/nav-selected')}
                style={{ position: 'absolute', left: 448, top: 15, width: 154, height: 110 }} />
            <image visible={selected === 'ship'} source={imageRef('ui/hero/nav-selected')}
                style={{ position: 'absolute', left: 598, top: 15, width: 154, height: 110 }} />
            <view interaction="press" onClick={() => p.onSelect?.('wheel')}
                style={{ position: 'absolute', left: 0, top: 0, width: 150, height: 125 }}>
                <image source={imageRef('ui/hero/nav-wheel')}
                    style={{ position: 'absolute', left: 28, top: 28, width: 90, height: 84 }} />
            </view>
            <view interaction="press" onClick={() => p.onSelect?.('island')}
                style={{ position: 'absolute', left: 150, top: 0, width: 150, height: 125 }}>
                <image source={imageRef('ui/hero/nav-island')}
                    style={{ position: 'absolute', left: 30, top: 28, width: 95, height: 83 }} />
            </view>
            <view interaction="press" onClick={() => p.onSelect?.('hero')}
                style={{ position: 'absolute', left: 300, top: 0, width: 150, height: 125 }}>
                <image source={imageRef('ui/hero/nav-hero')}
                    style={{ position: 'absolute', left: 18, top: 0, width: 115, height: 116 }} />
            </view>
            <view interaction="press" onClick={() => p.onSelect?.('explore')}
                style={{ position: 'absolute', left: 450, top: 0, width: 150, height: 125 }}>
                <image source={imageRef('ui/hero/nav-wheel')}
                    style={{ position: 'absolute', left: 29, top: 28, width: 90, height: 84 }} />
            </view>
            <view interaction="press" onClick={() => p.onSelect?.('ship')}
                style={{ position: 'absolute', left: 600, top: 0, width: 150, height: 125 }}>
                <image source={imageRef('ui/hero/nav-ship')}
                    style={{ position: 'absolute', left: 29, top: 22, width: 89, height: 95 }} />
            </view>
            <image visible={p.noticeExplore === true} source={imageRef('ui/mail/unread-dot')}
                style={{ position: 'absolute', left: 560, top: 16, width: 24, height: 24 }} />
            <image visible={p.noticeShip === true} source={imageRef('ui/mail/unread-dot')}
                style={{ position: 'absolute', left: 710, top: 16, width: 24, height: 24 }} />
        </view>
    );
});
