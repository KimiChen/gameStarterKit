import { MailModel as MailEntity } from '../../../../generated/persistence/MailModel'
import { User } from '../../user/bean/User'

export class MailAuditWriter {
    static recordLog(user: User, mail: MailEntity, status: string) {
        // ClickHouse mail audit is not implemented yet.
    }
}
