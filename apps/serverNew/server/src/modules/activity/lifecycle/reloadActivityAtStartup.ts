import { LocalAction } from '../../../runtime/action/LocalAction'
import { ActionActivityOpenReload } from '../action/ActionActivityOpenReload'

export function reloadActivityAtStartup() {
    LocalAction.send(ActionActivityOpenReload, { sIds: [SERVER_ID] }, 0, SERVER_ID)
}
