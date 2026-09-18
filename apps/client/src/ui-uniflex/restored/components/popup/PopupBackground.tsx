import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

/** Absolute fill: size belongs to the popup, while border insets belong to the resource manifest. */
export const PopupBackground = defineComponent<{ readonly kind?: 'prompt' | 'small' | 'settings' | 'profile' }>((p) => (
    <view name="PopupBackground" style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <image visible={p.kind !== 'small' && p.kind !== 'settings' && p.kind !== 'profile'} source={imageRef('ui/popup/prompt')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={p.kind === 'small'} source={imageRef('ui/popup/small')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={p.kind === 'settings'} source={imageRef('ui/settings/panel')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        <image visible={p.kind === 'profile'} source={imageRef('ui/character/window')}
            style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
    </view>
));
