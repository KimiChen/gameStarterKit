import { defineView } from '@uniflex/compiler';
import { ShopGetItemPanel, type ShopGetItemPanelProps } from './ShopGetItemPanel';

export type ShopGetItemParams = Omit<ShopGetItemPanelProps, 'visible'>;

export const ShopGetItem = defineView<ShopGetItemParams | void>({ zIndex: 'window' }, (context) => {
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
