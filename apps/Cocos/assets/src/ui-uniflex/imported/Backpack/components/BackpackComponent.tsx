import { defineComponent } from '@uniflex/compiler';
import type { BackpackAction } from '../Backpack.authoring';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

export const BackpackComponent = defineComponent<{
    readonly selected: string | null;
    readonly emit: (id: string, action: BackpackAction['action']) => void;
}>((props) => {
    const { selected, emit } = props;
    return (
    <view name="分页-训练" style={{ position: 'absolute', left: 27, top: 1114, width: 915, height: 487, opacity: selected === "layer-57" ? 0.72 : 1 }}
 interaction="press" onClick={() => emit("layer-57", "tab")}>
        <image name="组 486" style={{ position: 'absolute', left: 163, top: 150, width: 169, height: 55 }} source={imageRef("asset-b760169e911b9a9f89c4608392ab86d7e12e2313c4409f731a83aa7a88acab55")} />
        <image name="组 486" style={{ position: 'absolute', left: 351, top: 150, width: 169, height: 55 }} source={imageRef("asset-abb0b1b0022bc067ed3ab57005a202b873e11337aad963d58dcab8eb90d240c9")} />
        <image name="组 486" style={{ position: 'absolute', left: 539, top: 150, width: 169, height: 55 }} source={imageRef("asset-be072b6d590611827c6df2e3fe7d8aaeb9651be8f005e8042b2f225998a41892")} />
    </view>
    );
});
