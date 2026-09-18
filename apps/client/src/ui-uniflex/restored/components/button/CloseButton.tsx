import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

/** 72px hit target around a 50px icon, anchored to the popup's top-right. */
export const CloseButton = defineComponent<{ readonly onClick?: () => void }>((p) => (
    <view name="CloseButton" interaction="press" onClick={() => p.onClick?.()}
        style={{ position: 'absolute', right: 15, top: 6, width: 72, height: 72 }}>
        <image source={imageRef('ui/popup/close')}
            style={{ position: 'absolute', left: 11, top: 11, width: 50, height: 50 }} />
    </view>
));
