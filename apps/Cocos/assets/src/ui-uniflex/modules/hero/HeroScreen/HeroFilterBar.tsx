import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export type HeroFilterId = 'all' | 'shield' | 'sword' | 'anchor' | 'unowned';

export interface HeroFilterBarProps {
    readonly selected?: HeroFilterId;
    readonly onSelect?: (id: HeroFilterId) => void;
}

const labels: Record<HeroFilterId, string> = {
    all: '全部',
    shield: '盾',
    sword: '剑',
    anchor: '锚',
    unowned: '未获得',
};

export const HeroFilterBar = defineComponent<HeroFilterBarProps>((p) => {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<HeroFilterId>(p.selected ?? 'all');
    const pick = (id: HeroFilterId) => {
        setSelected(id);
        setOpen(false);
        p.onSelect?.(id);
    };
    const title = labels[selected];
    const iconAll = imageRef('ui/hero/filter-icon');
    const iconShield = imageRef('ui/hero/class-shield');
    const iconSword = imageRef('ui/hero/class-sword');
    const iconAnchor = imageRef('ui/hero/class-anchor');
    const iconUnowned = imageRef('ui/hero/filter-option-icon');
    const currentIcon = selected === 'shield' ? iconShield
        : selected === 'sword' ? iconSword
        : selected === 'anchor' ? iconAnchor
        : selected === 'unowned' ? iconUnowned
        : iconAll;
    const currentIconLeft = selected === 'unowned' ? 16 : 15;
    const currentIconTop = selected === 'all' || selected === 'unowned' ? 13 : 8;
    const currentIconWidth = selected === 'all' ? 29 : selected === 'unowned' ? 26 : 26;
    const currentIconHeight = selected === 'all' || selected === 'unowned' ? 27 : 32;
    const arrowDown = imageRef('ui/hero/filter-arrow');
    const arrowUp = imageRef('ui/hero/filter-arrow-up');
    const arrow = open ? arrowUp : arrowDown;
    const arrowTop = open ? 15 : 18;
    const optionMark = imageRef('ui/hero/filter-option');
    const optionTop = selected === 'all' ? 2
        : selected === 'shield' ? 52
        : selected === 'sword' ? 102
        : selected === 'anchor' ? 152
        : 202;
    return (
        <view name="HeroFilterBar" style={open
            ? { position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }
            : { position: 'absolute', left: 456, top: 98, width: 281, height: 52 }}>
            <view visible={open} interaction="press" onClick={() => setOpen(false)}
                style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }} />
            <view interaction="press" onClick={() => setOpen(!open)}
                style={{ position: 'absolute', left: open ? 456 : 0, top: open ? 98 : 0, width: 280, height: 52 }}>
                <image source={imageRef('ui/hero/filter-bg')}
                    style={{ position: 'absolute', width: 280, height: 52 }} />
                <image source={currentIcon}
                    style={{ position: 'absolute', left: currentIconLeft, top: currentIconTop, width: currentIconWidth, height: currentIconHeight }} />
                <text value={title}
                    style={{ position: 'absolute', left: 54, top: 8, width: 170, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                <image source={arrow}
                    style={{ position: 'absolute', left: 236, top: arrowTop, width: 34, height: 23 }} />
            </view>
            <view visible={open} style={{ position: 'absolute', left: 455, top: 155, width: 281, height: 254 }}>
                <image source={imageRef('ui/hero/filter-dropdown')}
                    style={{ position: 'absolute', width: 281, height: 254 }} />
                <image source={optionMark}
                    style={{ position: 'absolute', left: 2, top: optionTop, width: 277, height: 50 }} />
                <view interaction="press" onClick={() => pick('all')} style={{ position: 'absolute', left: 0, top: 2, width: 281, height: 50 }}>
                    <image source={imageRef('ui/hero/filter-icon')}
                        style={{ position: 'absolute', left: 16, top: 12, width: 29, height: 27 }} />
                    <text value="全部" style={{ position: 'absolute', left: 55, top: 11, width: 180, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                </view>
                <view interaction="press" onClick={() => pick('shield')} style={{ position: 'absolute', left: 0, top: 52, width: 281, height: 50 }}>
                    <image source={imageRef('ui/hero/class-shield')}
                        style={{ position: 'absolute', left: 16, top: 8, width: 26, height: 32 }} />
                    <text value="盾" style={{ position: 'absolute', left: 55, top: 11, width: 180, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                </view>
                <view interaction="press" onClick={() => pick('sword')} style={{ position: 'absolute', left: 0, top: 102, width: 281, height: 50 }}>
                    <image source={imageRef('ui/hero/class-sword')}
                        style={{ position: 'absolute', left: 16, top: 8, width: 26, height: 32 }} />
                    <text value="剑" style={{ position: 'absolute', left: 55, top: 11, width: 180, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                </view>
                <view interaction="press" onClick={() => pick('anchor')} style={{ position: 'absolute', left: 0, top: 152, width: 281, height: 50 }}>
                    <image source={imageRef('ui/hero/class-anchor')}
                        style={{ position: 'absolute', left: 16, top: 8, width: 26, height: 32 }} />
                    <text value="锚" style={{ position: 'absolute', left: 55, top: 11, width: 180, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                </view>
                <view interaction="press" onClick={() => pick('unowned')} style={{ position: 'absolute', left: 0, top: 202, width: 281, height: 50 }}>
                    <image source={imageRef('ui/hero/filter-option-icon')}
                        style={{ position: 'absolute', left: 17, top: 12, width: 26, height: 27 }} />
                    <text value="未获得" style={{ position: 'absolute', left: 55, top: 11, width: 180, height: 28,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                </view>
            </view>
        </view>
    );
});
