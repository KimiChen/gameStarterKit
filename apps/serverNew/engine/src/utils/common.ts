import console from 'console'
import crypto from 'crypto'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { TimeAdd } from './TimeAdd'
import { isMap, isMapIterator } from 'util/types'
import { ContextEngine } from '../context/ContextEngine'

/**
 * sleep 精度毫秒
 * @param ms
 */
export async function sleep(ms: int): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function timestamp(): int {
    return Math.floor(millisecond() / 1000)
}

/** 在上下文环境时, 会读取缓存的时间, 来保证上下文中时间不变 */
export function millisecond(): int {
    const cacheMillisecond = ContextEngine.cacheMillisecond
    if (cacheMillisecond > 0) {
        return cacheMillisecond
    }
    const v = Date.now() + TimeAdd.__time_add * 1000
    ContextEngine.cacheMillisecond = v
    return v
}

export function md5(str: string) {
    return crypto.createHash('md5').update(str).digest('hex')
}

export function base64_encode(data: string) {
    const buf = Buffer.from(data)
    const base64 = buf.toString('base64')
    return base64
}

export function base64_decode(base64: string) {
    const buf = Buffer.from(base64, 'base64')
    const data = buf.toString('utf8')
    return data
}
export function strtotime(dateStr: string): int {
    const date = new Date(dateStr)
    const time = date.getTime()
    if (!time) {
        return 0
    }
    return Math.floor(date.getTime() / 1000)
}
export function datetotime(date: Date): int {
    return Math.floor(date.getTime() / 1000)
}
/**
 * @param time 秒  
 * @returns 
 */
export function timetodate(time: int = 0) {
    if (!time) {
        time = timestamp()
    }
    return new Date(time * 1000)
}

// 首字母大写
export function ucfirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
}
// 首字母小写
export function lcfirst(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1)
}

// 有序的拼query string
export function http_build_query_sort(urlParam: any) {
    const keys = Object.keys(urlParam).sort()
    const strs: string[] = []
    for (const key of keys) {
        strs.push(key + '=' + (urlParam as any)[key])
    }
    return strs.join('&')
}

// map的第一项
export function mapFirst<K, V>(map: Map<K, V> | ReadonlyMap<K, V>): V | undefined {
    if (map.size == 0) {
        return undefined
    }
    return map.values().next().value
}
// map的最后一项
export function mapEnd<K, V>(map: Map<K, V> | ReadonlyMap<K, V>): V | undefined {
    if (map.size == 0) {
        return undefined
    }
    let lastV: V | undefined
    for (const v of map.values()) {
        lastV = v
    }
    return lastV
}

// clone出来map的values
export function mapValues<K, V>(map: Map<K, V> | ReadonlyMap<K, V>): V[] {
    return Array.from(map.values())
}

export function mapKeys<K, V>(map: Map<K, V> | ReadonlyMap<K, V>): K[] {
    return Array.from(map.keys())
}

export function clone(obj: any) {
    return typeof obj == 'object' ? Object.assign({}, obj) : obj
}

export function clonedeep(obj: any) {
    if (typeof obj != 'object') {
        return obj
    }

    const objProto = Object.getPrototypeOf(obj)
    // @ts-ignore
    return Object.assign(Object.create(objProto), obj)
}

export function mt_rand(min: int, max: int): int {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export function Map2Array<K, V>(m: Map<K, V>) {
    if (m.size <= 0) {
        return undefined
    }
    const array: Array<V> = new Array<V>()
    m.forEach((f) => {
        array.push(f)
    })
    return array
}

export function map2Object(m: Map<string, any>): Object {
    return _map2ObjectAssist(m)
}

//辅助map2Object转换值数据
function _map2ObjectAssist(param: any): any {
    if (typeof param[Symbol.iterator] == 'function' && isMapIterator(param[Symbol.iterator]())) {
        const r: Record<string, any> = {}
        for (const [k, v] of param) {
            r[String(k)] = _map2ObjectAssist(v)
        }
        return r
    } else if (Array.isArray(param)) {
        const tmp = []
        for (const item of param) {
            tmp.push(_map2ObjectAssist(item))
        }
        return tmp
    } else if (typeof param == 'object') {
        const r: Record<string, any> = {}
        for (const k in param) {
            if (Object.hasOwn(param, k)) {
                r[k] = _map2ObjectAssist(param[k])
            }
        }
        return r
    }
    return param
}

/**
 * 计算给定文件的 md5 哈希值
 * @param filepath
 */
export function md5File(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5')
        const stream = fs.createReadStream(filepath)

        stream.on('error', (err) => reject(err))

        stream.on('data', (chunk) => hash.update(chunk))

        stream.on('end', () => {
            resolve(hash.digest('hex'))
        })
    })
}

/**
 * 递归获取指定路径下的所有文件
 * @param directoryPath
 */
export async function recursiveDirectoryFile(directoryPath: string) {
    const filesArray: string[] = []
    const files = fs.readdirSync(directoryPath) // 读取目录中的文件列表
    for (const file of files) {
        const filePath = path.join(directoryPath, file)
        const stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
            // 如果是目录，则递归遍历子目录
            filesArray.push(...(await recursiveDirectoryFile(filePath)))
        } else if (stats.isFile()) {
            filesArray.push(filePath)
        }
    }
    return filesArray
}

/**
 * 获取文件的修改时间
 * @param filePath
 */
export function filemtime(filePath: string) {
    // 检测文件路径有效性
    if (!fs.existsSync(filePath)) {
        console.error('file not found: ', filePath)
        return undefined
    }
    const stats = fs.statSync(filePath)
    return stats.mtime.getTime().toString()
}

/**
 * 把数字转成 a-zA-Z 代表0-51共52进制的字符串  超过之后就aa ab...
 * @param int
 */
export function convertToBase52(int: int): string {
    const base = 52
    const chars: string[] = []
    int = int - 1
    while (int >= 0) {
        const remainder = int % base
        chars.unshift(String.fromCharCode(remainder + (remainder < 26 ? 65 : 71)))
        int = Math.floor(int / base) - 1
        if (int === -1) {
            break
        }
    }

    return chars.join('')
}

/**
 * 获取游戏区服的 hash id
 * @param string $openId
 * @return int
 */
export function getUserServersMapId(openId: string): int {
    const str = md5(openId)
    const len = str.length
    let value = 0
    for (let i = 0; i < len; i++) {
        const ord = str.charCodeAt(i)
        value += ord * ord
    }
    return value % 10000 + 1
}

export function array_unique<T extends number | string>(items: T[]): T[] {
    const cache: { [key: string]: number } = {}
    const r: T[] = []
    for (let index = 0; index < items.length; index++) {
        const it = items[index]
        if (cache[it]) {
            continue
        }
        cache[it] = 1
        r.push(it)
    }
    return r
}

/**
 * 模版变量替换, 字符串变量替换, 模版渲染
 * const template = '{name}很厉name害，才{age}岁'
 * const context = { name: 'jawil', age: '15' }
 * console.log(templateRender(template, context))
*/
export function templateRender(template: string, params: { [key: string]: string | number }) {
    return template.replace(/\{(.*?)\}/g, (match, key) => String(params[key]))
}

/** 判读是否为内网ip */
export function isInnerIp(ip: string) {
    const privateIpRanges = [
        ['127.0.0.1', '127.255.255.255'],
        ['10.0.0.0', '10.255.255.255'],
        ['172.16.0.0', '172.31.255.255'],
        ['192.168.0.0', '192.168.255.255'],
    ]
    const targetArr = ip.split('.').map(el => Number(el))
    if (targetArr.length != 4) {
        return false
    }
    for (const [minRange, maxRange] of privateIpRanges) {
        const minRangeArr = minRange.split('.').map(el => Number(el))
        const maxRangeArr = maxRange.split('.').map(el => Number(el))
        let rightNum = 0
        for (let index = 0; index < targetArr.length; index++) {
            if (targetArr[index] >= minRangeArr[index] && targetArr[index] <= maxRangeArr[index]) {
                rightNum++
            }
        }
        if (rightNum == 4) {
            return true
        }
    }
    return false
}

export function getIPv4OfMachine() {
    const interfaces = os.networkInterfaces()
    for (const devName in interfaces) {
        const iface = interfaces[devName]
        if (!iface) {
            return
        }
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i]
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address
            }
        }
    }
}

export function lowercaseFirstLetter(str: string): string {
    return lcfirst(str)
}

export function is_numeric(v: string | number): boolean {
    if (Number.isSafeInteger(v)) {
        return true
    }
    //正则对应数据在单测里
    const reg = /^-{0,1}[\d\.]+/
    const match = reg.exec(v as string) ?? [null]
    if (match[0] == v) {
        return true
    }
    return false
}

export function generateId(input: string, length: number = 6): string {
    const hash = crypto.createHash('sha1').update(input).digest('base64')
    const shortHash = hash.substr(0, length)
    return shortHash
}

export function getLocalIp(): string {
    const interfaces = os.networkInterfaces()
    for (const name in interfaces) {
        const addresses = interfaces[name]
        if (addresses) {
            for (const address of addresses) {
                if (address.family === 'IPv4' && !address.internal) {
                    return address.address
                }
            }
        }
    }
    return '0.0.0.0'
}

