/**
 * ta生成相关配置路径
 */
export class Config {
    /**数数表格路径*/
    public excelFilePath: string = '/scripts/taToModel/source/taFile.xlsx'

    /**数数模型输出命名空间*/
    public taModelNamespace: string = 'taModels'

    /**数数模型输出路径*/
    public taModelPath: string = '/generated/telemetry/models/'

    /**数数模块输出命名空间*/
    public taModuleNamespace: string = 'statTaModule'

    /**数数模块输出路径*/
    public taModulePath: string = '/generated/telemetry/'

    /**数数公共事件属性工作簿*/
    public taEventSheet: string = '2_#事件数据'

    /**数数公共事件属性输出命名空间*/
    public taCommonNamespace: string = 'taModels'

    /**数数公共事件属性类名*/
    public taCommonClassName: string = 'TaCommonUser'

    /**数数公共事件属性输出路径*/
    public taCommonPath: string = '/generated/telemetry/models/'

    /**数数公共事件属性工作簿*/
    public taCommonSheet: string = '1_#用户ID及公共事件属性'

    /**数数用户数据输出命名空间*/
    public taUserNamespace: string = 'taModels'

    /**数数用户数据属性输出路径*/
    public taUserClassName: string = 'TaUserData'

    /**数数用户数据属性输出路径*/
    public taUserPath: string = '/generated/telemetry/models/'

    /**数数公共事件属性工作簿*/
    public taUserSheet: string = '3_#用户数据'

    /**模版文件路径*/
    public tplPath: string = './tpl'

    /** Class.ejs */
    public tplClass: string = '/scripts/taToModel/tpl/Class.ejs'

    /** ModuleMethod.ejs */
    public tplModuleMethod: string = '/scripts/taToModel/tpl/ModuleMethod.ejs'
}
