import { defineView } from '@uniflex/compiler';
import { ShopGetItemPanel, type ShopGetItemPanelProps } from '../ShopGetItem/ShopGetItemPanel';

export type ShopGetItemRestoredParams = Omit<ShopGetItemPanelProps, 'visible'>;

export const ShopGetItemRestored = defineView<ShopGetItemRestoredParams | void>({ zIndex: 'window' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="ShopGetItemPage" style={{ width: 750, height: 1624 }}>
            <ShopGetItemPanel title={params.title} name={params.name} description={params.description}
                owned={params.owned} quantity={params.quantity} max={params.max}
                unitPrice={params.unitPrice} onClose={params.onClose} onChange={params.onChange}
                onBuy={params.onBuy} />
        </view>
    );
});
