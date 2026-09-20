import path from 'path'
import { Config } from '../conf/Config'
import * as ExcelJS from 'exceljs'

/**
 * 抽象转换类，用于定义转换 Excel 文件的基本结构和方法
 */
export abstract class AbstractConvert {
    // 配置对象，用于存储配置信息
    protected config: Config

    // Excel 工作簿对象，用于存储 Excel 文件数据
    protected workBook: ExcelJS.Workbook

    // 项目路径，用于存储项目的根目录路径
    protected projectPath: string = path.resolve(__dirname, '../../')

    /**
     * 构造函数，用于初始化抽象转换类的实例
     * @param config - 配置对象，包含转换所需的配置信息
     * @param spreadSheet - Excel 工作簿对象，包含需要转换的数据
     */
    constructor(config: Config, spreadSheet: ExcelJS.Workbook) {
        // 初始化配置对象
        this.config = config
        // 初始化工作簿对象
        this.workBook = spreadSheet
    }

    /**
     * 抽象方法，用于执行具体的转换逻辑
     */
    public abstract run(): void
}
