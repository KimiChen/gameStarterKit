export type ChangeDocumentField = {
    name?: string
    type: string
}

export class ChangeDocumentNode {
    public route: string | number = ''

    public desc: string = ''

    public ui: any = {}

    public ext: any = {}

    dataProvider?: string

    protected static readonly UI_REFRESH_SELF = 'refreshSelf'

    protected static readonly UI_ICON = 'icon'

    protected static readonly UI_DESC_SECOND = 'descSecond'

    protected static readonly UI_OPTIONS = 'options'

    protected static readonly UI_OPTIONS_REPLACE_META = 'options_replace_meta'

    protected static readonly UI_BUTTON_TYPE = 'buttonType'

    protected static readonly UI_AUTO_RELOAD = 'autoReload'

    protected static readonly UI_JSON_FOR_CLICK = 'jsonForClick'

    protected static readonly EXT_DOWNLOAD_FOR_CLICK = 'downloadForClick'

    protected static readonly UI_VALUE_TYPE = 'valueType'

    protected static readonly UI_IMMEDIATELY_COMMIT_ACTION = 'immediately_commit_action'

    constructor(route: string, desc: string) {
        this.route = route
        this.desc = desc
    }

    protected setUiKeyValue(key: string, value: any = 1): void {
        this.ui[key] = value
    }

    protected setExtKeyValue(key: string, value: any = 1): void {
        this.ext[key] = value
    }

    public static getFormInputType(input: string | ChangeDocumentField): string {
        if ((input as ChangeDocumentField).type) {
            const fieldName = (input as ChangeDocumentField).name || false
            if (fieldName && fieldName.endsWith('time')) {
                input = 'timestamp'
            } else {
                input = (input as ChangeDocumentField).type
            }
        }

        switch (input) {
            case 'bool':
                return 'bool'
            case 'int':
            case 'float':
                return 'number'
            case 'string':
                return 'text'
            case 'timestamp':
                return 'timestamp'
            default:
                return input as string
        }
    }
}
