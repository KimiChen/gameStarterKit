import { defineComponent } from '@uniflex/compiler';
import { imageRef } from '../../../../kits/uniflex/api/core/index';

export const BackpackTrainingPagination = defineComponent<{
    readonly selected: string | null;
    readonly setSelected: (id: string) => void;
}>(props => {
    void props.selected;
    void props.setSelected;
    return (
        <view name="分页-训练" style={{ position: 'absolute', left: 27, top: 1114, width: 915, height: 487 }}>
            <image name="组 486/1" style={{ position: 'absolute', left: 163, top: 150, width: 169, height: 55 }} source={imageRef("asset-b760169e911b9a9f89c4608392ab86d7e12e2313c4409f731a83aa7a88acab55")} />
            <image name="组 486/2" style={{ position: 'absolute', left: 351, top: 150, width: 169, height: 55 }} source={imageRef("asset-abb0b1b0022bc067ed3ab57005a202b873e11337aad963d58dcab8eb90d240c9")} />
            <image name="组 486/3" style={{ position: 'absolute', left: 539, top: 150, width: 169, height: 55 }} source={imageRef("asset-be072b6d590611827c6df2e3fe7d8aaeb9651be8f005e8042b2f225998a41892")} />
        </view>
    );
});
