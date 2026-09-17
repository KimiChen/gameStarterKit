import { defineView } from '@uniflex/compiler';
import { ShopPanel, type ShopPanelProps } from './ShopPanel';

export type ShopParams = Omit<ShopPanelProps, 'visible'>;

export const Shop = defineView<ShopParams | void>({ zIndex: 'screen' }, (context) => {
    const params = context.params ?? {};
    return (
        <view name="ShopPage" style={{ width: 750, height: 1624 }}>
            <ShopPanel title={params.title} tab={params.tab} currency={params.currency}
                restockLabel={params.restockLabel} restockTime={params.restockTime}
                vipGoods={params.vipGoods} allianceGoods={params.allianceGoods}
                gemGoods={params.gemGoods} onBack={params.onBack} onAction={params.onAction}
                onSelectTab={params.onSelectTab} />
        </view>
    );
});
