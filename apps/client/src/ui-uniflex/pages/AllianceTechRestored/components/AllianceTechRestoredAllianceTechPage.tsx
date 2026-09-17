import { defineComponent } from '@uniflex/compiler';
import type { AllianceTechRestoredAction } from '../AllianceTechRestored';
import { fontRef, imageRef } from '../../../../kits/uniflex/api/core/index';

export const AllianceTechRestoredAllianceTechPage = defineComponent<{
    readonly selected: string | null;
    readonly emit: (id: string, action: AllianceTechRestoredAction['action']) => void;
}>((props) => {
    const { selected, emit } = props;
    return (
    <view name="AllianceTechPage" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1628, opacity: selected === "layer-1" ? 0.72 : 1 }}
>
        <view name="AllianceTech" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1628 }}>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} source={imageRef("asset-20b507979acab65ee3fa9d93e96cf144ac9ce6a1fd7f805405bdf0cdf160a5c8")} />
            </view>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }}>
                <image name="Background / fill" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1624 }} source={imageRef("asset-6b898d100678ad9b7bbbf32cefb49514689f2a99ee698275f14269235cb7b3eb")} />
            </view>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 138, width: 750, height: 212 }}>
                <image name="Background / fill" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 212 }} source={imageRef("asset-27ada948ee1f32f9dbec4636f5ee622c4c93fca90581905c37ec649df35f675c")} />
            </view>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 222, width: 750, height: 1404 }}>
                <image name="Background / fill" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1404 }} source={imageRef("asset-d907555bd557d2ced87f18d6d89f2316f1082a47ed9de7efa6a3eb78c48e0c54")} />
            </view>
            <scroll-view name="AllianceTech/Tree" style={{ position: 'absolute', left: 0, top: 112, width: 750, height: 1257 }}>
                <view name="AllianceTech/Tree/Content" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1516 }}>
                    <view name="AllianceTech/TreeContent" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1516 }}>
                        <image name="AllianceTech/TreeContent / fill" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1516 }} source={imageRef("asset-1eb795077cbdf7a4d8aacfd82c2d126212a110228e78fc6b039986ba33d260f5")} />
                        <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1399 }}>
                            <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 1399 }} source={imageRef("asset-89858c4a9b8d6e62dc8f35a745f99118a08b707884557ea880b71cf776d42cd3")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 350, width: 12, height: 36 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 36 }} source={imageRef("asset-f35a733d018e3e005778cb6ab5620efa9dfc7d864514bc0867e491c1ab6212c8")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 380, width: 250, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 250, height: 12 }} source={imageRef("asset-33e1f3db44bf031f85eb8233e632731662e794d3ae92c4a7c45c3c8c8e6027f1")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 386, width: 12, height: 36 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 36 }} source={imageRef("asset-f35a733d018e3e005778cb6ab5620efa9dfc7d864514bc0867e491c1ab6212c8")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 350, width: 12, height: 35 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 35 }} source={imageRef("asset-24729875abd22a9c5535fc4e08c6dcf6f76a7ff1e97ea68dd310464cc1ea6832")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 379, width: 247, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 247, height: 12 }} source={imageRef("asset-22fc49716917d1b07df5cc41b0f5c21692f9e35f0305f1b0c2468420e3fb5542")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 606, top: 385, width: 12, height: 35 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 35 }} source={imageRef("asset-24729875abd22a9c5535fc4e08c6dcf6f76a7ff1e97ea68dd310464cc1ea6832")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 611, width: 12, height: 45 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 45 }} source={imageRef("asset-92c2eef371846fc137b19e6f7f4b0fa9aa353199d0948b13c1642bf502f70969")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 650, width: 13, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 13, height: 12 }} source={imageRef("asset-b2d1ee4c1d4f9e666983f2546df29e89b0b764ceb1a500dd8863c887e16dc52b")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 656, width: 12, height: 45 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 45 }} source={imageRef("asset-92c2eef371846fc137b19e6f7f4b0fa9aa353199d0948b13c1642bf502f70969")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 606, top: 612, width: 12, height: 44 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 44 }} source={imageRef("asset-9475d4cff7cafda6fc702e75b30e2842c2753287d8ce4859528b9c09d5863aff")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 606, top: 650, width: 12, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 12 }} source={imageRef("asset-9f5eebf05eb9fc59648fabbb5ac2cd4780462c0d35edcf7947ae3316bd96b767")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 606, top: 656, width: 12, height: 44 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 44 }} source={imageRef("asset-9475d4cff7cafda6fc702e75b30e2842c2753287d8ce4859528b9c09d5863aff")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 892, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 926, width: 250, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 250, height: 12 }} source={imageRef("asset-2e9c697f5f715392e21426b9342166f4e019add6a85b7d4b0056c890b934b00d")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 932, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 606, top: 892, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 926, width: 247, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 247, height: 12 }} source={imageRef("asset-267fb4c542fd5eea37c7304b29b6d46a8a14f34a5d411c7fb05de1c841c131a8")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 932, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 1164, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 1198, width: 250, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 250, height: 12 }} source={imageRef("asset-2e9c697f5f715392e21426b9342166f4e019add6a85b7d4b0056c890b934b00d")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 133, top: 1204, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 1164, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 371, top: 1198, width: 247, height: 12 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 247, height: 12 }} source={imageRef("asset-267fb4c542fd5eea37c7304b29b6d46a8a14f34a5d411c7fb05de1c841c131a8")} />
                        </view>
                        <view name="AllianceTechLink" style={{ position: 'absolute', left: 606, top: 1204, width: 12, height: 40 }}>
                            <image name="AllianceTechLink / fill" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 40 }} source={imageRef("asset-7a9b84eba2944e3e3693a2cb47f29f826f550b7ac1a9fe9dce092063d555c189")} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 294, top: 158, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-e551b3092f8580e49e2e8d93a94b0de14d590d849b476b9fca180f85c95ce014")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 7, top: 24, width: 155, height: 146 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 155, height: 146 }} source={imageRef("asset-dbbc18719ab3848f93ad35d0dc815cb895111037fedbf39687403bd5b02cfbb2")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="5/5" value={"5/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 57, top: 421, width: 164, height: 190 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 164, height: 190 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 164, height: 190 }} source={imageRef("asset-3c4879950a8651f753ea6139f4f35e10eddc760b276c7582c1ee8d7f72570a1e")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 19, top: 47, width: 125, height: 108 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 125, height: 108 }} source={imageRef("asset-23bc2b73b97ccc672c2e0843880f607143d35391230e73d3ca3f15db3ea7aaa9")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="1/5" value={"1/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 529, top: 420, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-e551b3092f8580e49e2e8d93a94b0de14d590d849b476b9fca180f85c95ce014")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 16, top: 24, width: 136, height: 122 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 136, height: 122 }} source={imageRef("asset-55ec21447ed578e9c93ec1094faf0d6f597174e4fe65120be87f8a7236d1d58f")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="1/5" value={"1/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 56, top: 700, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-7347a8ab9c3c70b61094e273c778e69830a79f62952a279008aff8158552bae0")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 18, top: 33, width: 132, height: 121 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 132, height: 121 }} source={imageRef("asset-14d56b55f0cbf5906530cc4abe93d20e5490287a27cafe0fcd5cd2425fc0558d")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 3, top: 3, width: 159, height: 186 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 159, height: 186 }} source={imageRef("asset-c34f17b35d00f2653199ba2a56b1aef87fc2c8feb8c2fd2f07659ae31140bdac")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="0/5" value={"0/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 529, top: 700, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-7347a8ab9c3c70b61094e273c778e69830a79f62952a279008aff8158552bae0")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 18, top: 33, width: 132, height: 121 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 132, height: 121 }} source={imageRef("asset-14d56b55f0cbf5906530cc4abe93d20e5490287a27cafe0fcd5cd2425fc0558d")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 3, top: 3, width: 159, height: 186 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 159, height: 186 }} source={imageRef("asset-c34f17b35d00f2653199ba2a56b1aef87fc2c8feb8c2fd2f07659ae31140bdac")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="0/5" value={"0/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 294, top: 972, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-7347a8ab9c3c70b61094e273c778e69830a79f62952a279008aff8158552bae0")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 18, top: 33, width: 132, height: 121 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 132, height: 121 }} source={imageRef("asset-14d56b55f0cbf5906530cc4abe93d20e5490287a27cafe0fcd5cd2425fc0558d")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 3, top: 3, width: 159, height: 186 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 159, height: 186 }} source={imageRef("asset-c34f17b35d00f2653199ba2a56b1aef87fc2c8feb8c2fd2f07659ae31140bdac")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="0/5" value={"0/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 56, top: 1244, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-7347a8ab9c3c70b61094e273c778e69830a79f62952a279008aff8158552bae0")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 18, top: 33, width: 132, height: 121 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 132, height: 121 }} source={imageRef("asset-14d56b55f0cbf5906530cc4abe93d20e5490287a27cafe0fcd5cd2425fc0558d")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 3, top: 3, width: 159, height: 186 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 159, height: 186 }} source={imageRef("asset-c34f17b35d00f2653199ba2a56b1aef87fc2c8feb8c2fd2f07659ae31140bdac")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="0/5" value={"0/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                        <view name="AllianceTechNode" style={{ position: 'absolute', left: 529, top: 1244, width: 165, height: 192 }}>
                            <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 165, height: 192 }} source={imageRef("asset-7347a8ab9c3c70b61094e273c778e69830a79f62952a279008aff8158552bae0")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 18, top: 33, width: 132, height: 121 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 132, height: 121 }} source={imageRef("asset-14d56b55f0cbf5906530cc4abe93d20e5490287a27cafe0fcd5cd2425fc0558d")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 3, top: 3, width: 159, height: 186 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 159, height: 186 }} source={imageRef("asset-c34f17b35d00f2653199ba2a56b1aef87fc2c8feb8c2fd2f07659ae31140bdac")} />
                            </view>
                            <view name="Group" style={{ position: 'absolute', left: 22, top: 142, width: 122, height: 35 }}>
                                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 122, height: 35 }} source={imageRef("asset-c503979deb4156a0bcff7f10a1820c4297b055527a3a87317c229557492363f3")} />
                            </view>
                            <text name="0/5" value={"0/5"} style={{ position: 'absolute', left: 20, top: 146.5, width: 126, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
                        </view>
                    </view>
                </view>
            </scroll-view>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 225, width: 750, height: 21 }}>
                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 21 }} source={imageRef("asset-2cf36e1fde547ff2a3412753f1f37396b53398a9786710cbb793c0d49997c210")} />
            </view>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 1357, width: 750, height: 20 }}>
                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 20 }} source={imageRef("asset-91f2128a9e91f79ed07acf04b9651583585fbe3aa5d224e89b96ee5c08445da5")} />
            </view>
            <view name="Group" style={{ position: 'absolute', left: 0, top: 144, width: 750, height: 90 }}>
                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 90 }} source={imageRef("asset-c8dfc19617d39cdc30614d09290551c47a7b50152624a68614cb057b86e678db")} />
            </view>
            <text name="科技" value={"科技"} style={{ position: 'absolute', left: 38, top: 172, width: 208, height: 84, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 40, lineHeight: 40, color: "#ffffff", horizontalAlign: "left", wrap: false, bold: true, outlineWidth: 2, outlineColor: "#593d84" }} />
            <view name="Group" style={{ position: 'absolute', left: 0, top: 1369, width: 750, height: 110 }}>
                <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 750, height: 110 }} source={imageRef("asset-165862c8ecddaae20147bb532e78f31c2f5202667a9b4143aa59c5984672f9c2")} />
            </view>
            <view name="AllianceTech/Back" style={{ position: 'absolute', left: 13, top: 1396, width: 64, height: 56 }} interaction="press" onClick={() => emit("layer-147", "back")}>
                <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 56 }}>
                    <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 64, height: 56 }} source={imageRef("asset-8e086790a66e7594123d93e31d25dec3cb72e47c76d747ac65bf15e10a232d50")} />
                </view>
            <view style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: selected === "layer-147" ? 0.72 : 1 }} />
            </view>
            <view name="IconCaptionButton" style={{ position: 'absolute', left: 646, top: 1376, width: 82, height: 97 }} interaction="press" onClick={() => emit("layer-150", "select")}>
                <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 82, height: 78 }}>
                    <view name="Group" style={{ position: 'absolute', left: 0, top: 0, width: 82, height: 78 }}>
                        <image name="Canvas" style={{ position: 'absolute', left: 0, top: 0, width: 82, height: 78 }} source={imageRef("asset-3052a3b962f41ab783c4faf7584ae95bba0f01ec3131c3fd3691e23d0bbbb0b2")} />
                    </view>
                </view>
                <text name="排行榜" value={"排行榜"} style={{ position: 'absolute', left: -2, top: 71, width: 86, height: 52, font: fontRef("font-72180cb66b9fc5df", 700), fontSize: 26, lineHeight: 26, color: "#ffffff", horizontalAlign: "center", wrap: false, bold: true }} />
            <view style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: selected === "layer-150" ? 0.72 : 1 }} />
            </view>
        </view>
    </view>
    );
});
