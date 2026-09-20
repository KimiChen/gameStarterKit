import { EventItem } from './EventItem'

/** 数数事件模块及其事件清单。 */
export class TelemetryEventModule {
    /**
     * 模块的名称
     */
    public name: string = ''

    /**
     * 模块的描述
     */
    public desc: string = ''

    /**
     * 模块的事件列表，使用对象来存储，键为事件名称，值为事件对象
     */
    public events: { [key: string]: EventItem } = {}
}
