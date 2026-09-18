import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export type HeroDetailTab = 'attributes' | 'skills' | 'equip';

export const HeroDetailTabs = defineComponent<{
    readonly tab: HeroDetailTab;
    readonly notice?: boolean;
    readonly onBack?: () => void;
    readonly onSelect?: (tab: HeroDetailTab) => void;
}>((p) => (
    <view name="HeroDetailTabs" style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110 }}>
        <image source={imageRef('ui/hero-detail/nav-base')}
            style={{ position: 'absolute', width: 750, height: 110, sizeMode: 'sliced' }} />
        <image visible={p.tab === 'attributes'} source={imageRef('ui/hero-detail/nav-selected')}
            style={{ position: 'absolute', left: 116, top: 0, width: 225, height: 90, sizeMode: 'sliced' }} />
        <image visible={p.tab === 'skills'} source={imageRef('ui/hero-detail/nav-selected')}
            style={{ position: 'absolute', left: 327, top: 0, width: 225, height: 90, sizeMode: 'sliced' }} />
        <image visible={p.tab === 'equip'} source={imageRef('ui/hero-detail/nav-selected')}
            style={{ position: 'absolute', left: 538, top: 0, width: 225, height: 90, sizeMode: 'sliced' }} />
        <view interaction="press" onClick={() => p.onBack?.()}
            style={{ position: 'absolute', left: 14, top: 28, width: 62, height: 54 }}>
            <image source={imageRef('ui/hero-detail/nav-back')} style={{ width: 62, height: 54 }} />
        </view>
        <view interaction="press" onClick={() => p.onSelect?.('attributes')}
            style={{ position: 'absolute', left: 116, top: 0, width: 225, height: 90 }}>
            <text value="属性" style={{ width: 225, height: 90, font: fontRef('fonts/regular', 700), fontSize: 36,
                color: p.tab === 'attributes' ? '#3F3254' : '#ffffff', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
        <view interaction="press" onClick={() => p.onSelect?.('skills')}
            style={{ position: 'absolute', left: 327, top: 0, width: 225, height: 90 }}>
            <text value="技能" style={{ width: 225, height: 90, font: fontRef('fonts/regular', 700), fontSize: 36,
                color: p.tab === 'skills' ? '#3F3254' : '#ffffff', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
        <view interaction="press" onClick={() => p.onSelect?.('equip')}
            style={{ position: 'absolute', left: 538, top: 0, width: 225, height: 90 }}>
            <text value="装备" style={{ width: 225, height: 90, font: fontRef('fonts/regular', 700), fontSize: 36,
                color: p.tab === 'equip' ? '#3F3254' : '#ffffff', bold: true,
                horizontalAlign: 'center', verticalAlign: 'center' }} />
        </view>
        <image visible={p.notice !== false} source={imageRef('ui/mail/unread-dot')}
            style={{ position: 'absolute', left: 298, top: 7, width: 24, height: 24 }} />
    </view>
));
