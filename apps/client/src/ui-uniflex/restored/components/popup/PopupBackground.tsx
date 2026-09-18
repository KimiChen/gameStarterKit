import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

/** Absolute fill: size belongs to the popup, while border insets belong to the resource manifest. */
export const PopupBackground = defineComponent<{ readonly kind?: 'prompt' | 'small' | 'settings' | 'profile' }>((p) => {
    const kind = p.kind;
    const prompt = imageRef('ui/popup/prompt');
    const small = imageRef('ui/popup/small');
    const settings = imageRef('ui/settings/panel');
    const profile = imageRef('ui/character/window');
    const source = kind === 'small' ? small
        : kind === 'settings' ? settings
        : kind === 'profile' ? profile
        : prompt;
    return (
        <view name="PopupBackground" style={{ position: 'absolute', width: '100%', height: '100%' }}>
            <image source={source}
                style={{ position: 'absolute', width: '100%', height: '100%', sizeMode: 'sliced' }} />
        </view>
    );
});
