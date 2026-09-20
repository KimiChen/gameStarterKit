import { C } from './c'


//用于测试处理循环引用的demo, 直接运行即可看到循环引用导致的报错
export class A extends C { }