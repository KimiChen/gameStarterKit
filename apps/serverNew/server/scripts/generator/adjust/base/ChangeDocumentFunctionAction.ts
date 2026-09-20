import { ChangeDocumentAction } from './ChangeDocumentAction'

export class ChangeDocumentFunctionAction extends ChangeDocumentAction {
    public group: string = ''

    public className: string = ''

    public methodName: string = ''

    public inApiLumen: boolean = false

    public canCustom: boolean = false

    public sort: number = 0

    static readonly FUNCTION = 'function'

    constructor(route: string, desc: string) {
        super(route, desc)
    }
}
