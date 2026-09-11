import { defineView, useState } from '@uniflex/compiler';
import { imageRef } from '../../../kits/uniflex/api/core/index';
import { BackpackTrainingPagination } from './components/BackpackTrainingPagination';

export const Backpack = defineView({ zIndex: 'window' }, () => {
    const [selected, setSelected] = useState<string | null>(null);
    return (
        <view name="Backpack" style={{ width: 750, height: 1334 }}>
            <image name="背景" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }} source={imageRef("asset-32916f407d08982f7711a649b30d6d3b83f883f471c800fba267272c37a58161")} />
            <view name="背包-可使用道具" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1334 }} interaction="press" onClick={() => setSelected("layer-2")}>
                <image name="背包-可使用道具/图像" style={{ width: '100%', height: '100%' }} source={imageRef("asset-af3335fc500654fa5397d02a2e1025d901215281f5d59a2e226b01542cf1697d")} />
            </view>
            <view name="组件-全屏底部返回" style={{ position: 'absolute', left: 1, top: 1226, width: 750, height: 108 }} interaction="press" onClick={() => setSelected("layer-27")}>
                <image name="组件-全屏底部返回/图像" style={{ width: '100%', height: '100%' }} source={imageRef("asset-7444808bbeff49cccb95a054cf83e73289542bedbd2b8fbc319e083be7985f14")} />
            </view>
            <image name="图层 1" style={{ position: 'absolute', left: 17, top: 252, width: 727, height: 981 }} source={imageRef("asset-160408331efbfbc63a7fbb1993565274d2d50968e3d8a327e3f5053c1307c02c")} />
            <image name="图层 22" style={{ position: 'absolute', left: 563, top: 1088, width: 166, height: 140 }} source={imageRef("asset-c7479ea87081f196ac56e041868b54d12baf8ce8c8383f7921cb1eb144e8d319")} />
            <image name="图层 8 拷贝" style={{ position: 'absolute', left: 0, top: 743, width: 750, height: 174 }} source={imageRef("asset-6ecb96f3d6bd2fc5fcf44f53427e18c70d065ca760f1fa9ecab3c7561f83d41b")} />
            <image name="图层 8 拷贝 2" style={{ position: 'absolute', left: 0, top: 921, width: 750, height: 142 }} source={imageRef("asset-c6be0db152eeb5aee6a1f32366ec77d66d3af7cc7d75dbe270ea783f506efa80")} />
            <image name="图层 8" style={{ position: 'absolute', left: 0, top: 597, width: 750, height: 174 }} source={imageRef("asset-6ecb96f3d6bd2fc5fcf44f53427e18c70d065ca760f1fa9ecab3c7561f83d41b")} />
            <image name="矩形 1" style={{ position: 'absolute', left: 32, top: 257, width: 686, height: 353 }} source={imageRef("asset-3f7f8d33478bff92b3eda438d1b490a7cfa46bec97465185a63a73995946c05c")} />
            <image name="100钻石" style={{ position: 'absolute', left: 310, top: 286, width: 131, height: 33 }} source={imageRef("asset-2825f8acc18771c7fd2b7602d1724feae4de0708c6d3f2314003eff75357259a")} />
            <image name="矩形 4 拷贝" style={{ position: 'absolute', left: 276, top: 293, width: 198, height: 18 }} source={imageRef("asset-701e7a20f403eaf5b892c08b10d348b1fcdea72587534093b07c75b63424cbe9")} />
            <view name="使用后获得5000点装备经验" style={{ position: 'absolute', left: 57, top: 344, width: 318, height: 25 }} interaction="press" onClick={() => setSelected("layer-13")}>
                <image name="使用后获得5000点装备经验/图像" style={{ width: '100%', height: '100%' }} source={imageRef("asset-be40e1e3efe9f2a15159d2327b419ad2a4f061a1749f7121fc7a305ecd4948db")} />
            </view>
            <image name="矩形 2" style={{ position: 'absolute', left: 57, top: 384, width: 637, height: 91 }} source={imageRef("asset-c3b8b8fd543455309333963155494805309329c5a98e636d476b0c65f9cc65ec")} />
            <image name="图层 3" style={{ position: 'absolute', left: 72, top: 402, width: 547, height: 57 }} source={imageRef("asset-7f47dbe004839cbb7c573d03f442b30986126bb70e86ef85b5a8165dc7edb686")} />
            <image name="图层 1066 拷贝 2" style={{ position: 'absolute', left: 628, top: 403, width: 51, height: 51 }} source={imageRef("asset-bb91f0f5828db69fc81e6bd8e5a0c24189afc85af56ce2aad38780e1516038cb")} />
            <image name="图层 5" style={{ position: 'absolute', left: 241, top: 494, width: 268, height: 92 }} source={imageRef("asset-a81a3df8a52c4a4eb3053db23d57856d13da589d4fef51b94130de3512c3da4a")} />
            <image name="组 1" style={{ position: 'absolute', left: 87, top: 246, width: 39, height: 16 }} source={imageRef("asset-930b9d4d5999c59d06f0db299b52c3ddeb1aee46051df5f976d5ba59294c067a")} />
            <image name="图层 6" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }} source={imageRef("asset-2fe8e6c2a228cc8932b1a02ef77d563dddc0618eb038ea3ea29338b35f37fdc6")} />
            <BackpackTrainingPagination selected={selected} setSelected={setSelected} />
        </view>
    );
});
