import { ChangeDocumentNode } from './ChangeDocumentNode'
import { ChangeDocumentTreeNode } from './ChangeDocumentTreeNode'
import json5 from 'json5'

export class ChangeDocumentAction extends ChangeDocumentNode {
    static readonly ADD = 'add'

    static readonly EDIT = 'edit'

    static readonly DEL = 'del'

    static readonly DEFAULT = 'default'

    public childNodeTemplate?: ChangeDocumentTreeNode

    public controlNode?: ChangeDocumentTreeNode

    constructor(route: string, desc: string) {
        if (route === '') {
            route = ChangeDocumentAction.DEFAULT
        }
        super(route, desc)
    }

    public setUiIcon(iconName: string): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_ICON, iconName)
        let buttonType
        switch (iconName) {
            case 'el-icon-caret-right':
            case 'el-icon-plus':
                buttonType = 'success'
                break
            case 'el-icon-refresh-right':
            case 'el-icon-suitcase':
            case 'el-icon-edit':
                buttonType = 'primary'
                break
            case 'el-icon-delete':
                buttonType = 'danger'
                break
            default:
                buttonType = 'primary'
        }
        this.setUiKeyValue(ChangeDocumentNode.UI_BUTTON_TYPE, buttonType)
    }

    public setUiJsonForClick(json: any): void {
        if (typeof json === 'string') {
            json = json5.parse(json)
        }
        this.setUiKeyValue(ChangeDocumentNode.UI_JSON_FOR_CLICK, json)
    }

    public setExtDownloadForClick(url: string): void {
        this.setExtKeyValue(ChangeDocumentNode.EXT_DOWNLOAD_FOR_CLICK, url)
    }

    public setUiButtonType(p: string): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_BUTTON_TYPE, p)
    }

    public setUiRefreshAfterAdd(): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_REFRESH_SELF)
    }

    public setUiSecondDesc(p: string): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_DESC_SECOND, p)
    }

    public setUiAutoReload(yes: number): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_AUTO_RELOAD, yes)
    }

    public setImmediatelyCommitAction(): void {
        this.setUiKeyValue(ChangeDocumentNode.UI_IMMEDIATELY_COMMIT_ACTION, 1)
    }
}
