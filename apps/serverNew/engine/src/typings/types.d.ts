/** 和Record功能一样,但是值添加了undefined,作为提示更安全 */
 type RecordU<K extends keyof any, T> = {
    [P in K]: T | undefined;
};