/* eslint-disable no-var */
declare global {
    // 整数精确的最大最小值为+-9007_1992_5474_0991, 如果有小数则直接去除
    type int = number
    // 正整数精确的【0-9007_1992_5474_0991】目前仅限协议定义使用
    type uint = number
}

export {}
