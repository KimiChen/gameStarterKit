/** UniFlex authoring（*.authoring.tsx，@uniflex/compiler defineView 写法）依赖的全局 JSX
 *  命名空间（view/text/image 等内建件，见 @uniflex/compiler/jsx 的 declare global）。
 *  tsx 进入 src 依赖图后，两份客户端 typecheck 配置（tsconfig.test.json / tsconfig.json）
 *  都需要本文件在包含集内；⛔ 放 src/ 会进 Cocos 镜像，故置于客户端根并由 include 显式收录。 */
import "@uniflex/compiler/jsx";
