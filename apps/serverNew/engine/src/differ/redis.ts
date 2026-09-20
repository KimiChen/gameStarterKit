import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis'
import { BaseType } from './diff'

export declare type Redis = RedisClientType<RedisModules, RedisFunctions, RedisScripts>

/** differ 表示一个 JSON 类型的数据，类型定义可能仅仅适用于 differ 模块内部  */
export declare type JSONData = BaseType | JSONArray | JSONObject
export declare type JSONObject = { [key: string]: JSONData | null | undefined }
export declare type JSONArray = BaseType[]
