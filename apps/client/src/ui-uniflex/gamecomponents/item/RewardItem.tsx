import { defineComponent } from '@uniflex/compiler';
import { fontRef, imageRef } from '../../../kits/uniflex/api/core/index';
import { itemIcon } from './ItemSlot';
import type { RewardItemData } from '../tech/allianceTech';

export type { RewardItemData } from '../tech/allianceTech';

export interface RewardItemProps {
    readonly item: RewardItemData;
    readonly color?: string;
}

const DARK = '#3F3254';

/** Compact reward chip: item icon + count. Artwork follows the item id. */
export const RewardItem = defineComponent<RewardItemProps>((p) => {
    const item = p.item;
    const itemId = item.itemId;
    const count = item.count;
    const left = item.left;
    const top = item.top;
    const isGem = itemId === 'gem';
    const isLeaf = itemId === 'leaf';
    const isTicket = itemId === 'ticket';
    const gemIcon = imageRef('ui/alliance-march/gem');
    const leafIcon = imageRef('ui/alliance-march/leaf');
    const ticketIcon = imageRef('ui/alliance-march/ticket');
    const fallbackIcon = isGem || isLeaf || isTicket ? gemIcon : itemIcon(itemId);
    const icon = isGem ? gemIcon : isLeaf ? leafIcon : isTicket ? ticketIcon : fallbackIcon;
    const iconWidth = isGem ? 59 : isLeaf ? 51 : isTicket ? 48 : 52;
    const iconHeight = isGem ? 53 : isLeaf ? 50 : isTicket ? 52 : 52;
    const color = p.color ?? DARK;
    const width = iconWidth + 16 + 120;
    const height = iconHeight;
    return (
        <view name="RewardItem"
            style={{ position: 'absolute', left: left, top: top, width: width, height: height,
                flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <image name="RewardItem/Icon" source={icon}
                style={{ width: iconWidth, height: iconHeight }} />
            <text name="RewardItem/Count" value={count}
                style={{ width: 120, height: height,
                    font: fontRef('fonts/regular', 700), fontSize: 26, color: color, bold: true,
                    horizontalAlign: 'left', verticalAlign: 'center' }} />
        </view>
    );
});
