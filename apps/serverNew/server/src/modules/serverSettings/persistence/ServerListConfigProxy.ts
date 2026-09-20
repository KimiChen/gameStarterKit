import { ServerListConfigModel } from '../../../../generated/persistence/ServerListConfigModel'

export class ServerListConfigProxy {
    // 该表只有一条记录
    public static async getObj(): Promise<ServerListConfigModel> {
        let model = await ServerListConfigModel.findOneBy({ id: 1 })
        if (!model) {
            model = new ServerListConfigModel()
            model.id = 1
        }
        return model
    }
}
