import { RecProperty } from './RecProperty'

/** msg包含req res 推送消息 */
export interface IMsgType {
    version: int

    name: string

    comment: string

    package: string

    properties: Map<string, RecProperty>

    get propsExist(): IterableIterator<RecProperty>
}
