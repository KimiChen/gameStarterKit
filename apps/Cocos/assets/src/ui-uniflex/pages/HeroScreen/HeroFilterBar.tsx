import { defineComponent, useState } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';

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
    return (
        <view name="HeroFilterBar" style={{ position: 'absolute', left: 456, top: 98, width: 281, height: open ? 311 : 52 }}>
            <view interaction="press" onClick={() => setOpen(!open)}
                style={{ position: 'absolute', left: 0, top: 0, width: 280, height: 52 }}>
                <image source={imageRef('ui/hero/filter-bg')}
                    style={{ position: 'absolute', width: 280, height: 52 }} />
                <image visible={selected === 'all'} source={imageRef('ui/hero/filter-icon')}
                    style={{ position: 'absolute', left: 15, top: 13, width: 29, height: 27 }} />
                <image visible={selected === 'shield'} source={imageRef('ui/hero/class-shield')}
                    style={{ position: 'absolute', left: 15, top: 8, width: 26, height: 32 }} />
                <image visible={selected === 'sword'} source={imageRef('ui/hero/class-sword')}
                    style={{ position: 'absolute', left: 15, top: 8, width: 26, height: 32 }} />
                <image visible={selected === 'anchor'} source={imageRef('ui/hero/class-anchor')}
                    style={{ position: 'absolute', left: 15, top: 8, width: 26, height: 32 }} />
                <image visible={selected === 'unowned'} source={imageRef('ui/hero/filter-option-icon')}
                    style={{ position: 'absolute', left: 16, top: 13, width: 26, height: 27 }} />
                <text value={title}
                    style={{ position: 'absolute', left: 54, top: 8, width: 170, height: 36,
                        font: fontRef('fonts/regular', 700), fontSize: 28, color: '#584871', bold: true, verticalAlign: 'center' }} />
                <image visible={!open} source={imageRef('ui/hero/filter-arrow')}
                    style={{ position: 'absolute', left: 236, top: 18, width: 34, height: 23 }} />
                <image visible={open} source={imageRef('ui/hero/filter-arrow-up')}
                    style={{ position: 'absolute', left: 236, top: 15, width: 34, height: 23 }} />
            </view>
            <view visible={open} style={{ position: 'absolute', left: -1, top: 57, width: 281, height: 254 }}>
                <image source={imageRef('ui/hero/filter-dropdown')}
                    style={{ position: 'absolute', width: 281, height: 254 }} />
                <image visible={selected === 'all'} source={imageRef('ui/hero/filter-option')}
                    style={{ position: 'absolute', left: 2, top: 2, width: 277, height: 50 }} />
                <image visible={selected === 'shield'} source={imageRef('ui/hero/filter-option')}
                    style={{ position: 'absolute', left: 2, top: 52, width: 277, height: 50 }} />
                <image visible={selected === 'sword'} source={imageRef('ui/hero/filter-option')}
                    style={{ position: 'absolute', left: 2, top: 102, width: 277, height: 50 }} />
                <image visible={selected === 'anchor'} source={imageRef('ui/hero/filter-option')}
                    style={{ position: 'absolute', left: 2, top: 152, width: 277, height: 50 }} />
                <image visible={selected === 'unowned'} source={imageRef('ui/hero/filter-option')}
                    style={{ position: 'absolute', left: 2, top: 202, width: 277, height: 50 }} />
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
