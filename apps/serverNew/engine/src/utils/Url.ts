import querystring from 'querystring'
import axios, { AxiosError, AxiosResponse, RawAxiosRequestHeaders } from 'axios'

export class UrlResonse {

    readonly CODE_SUCCESS = 200

    public status: number

    public data: any

    constructor(res: Partial<AxiosResponse>) {
        this.status = res.status!
        this.data = res.data!
    }

    public getBodyArray() {
        if (!this.data) {
            return
        }
        return JSON.parse(this.data)
    }

    public isCodeOK() {
        return this.status === this.CODE_SUCCESS
    }
}

const defaultErrorRes: UrlResonse = new UrlResonse({ status: 500, data: 'unknown' })

export class Url {
    public static async get(uri: string, queryParam?: any, timeout: number = 3000) {
        let httpRes: UrlResonse
        try {
            const res = await axios.get(uri, { params: queryParam, timeout: timeout })
            httpRes = new UrlResonse(res)
        } catch (e) {
            if (e instanceof AxiosError) {
                httpRes = defaultErrorRes
                if (e.response) {
                    httpRes = new UrlResonse(e.response)
                }
            } else {
                httpRes = defaultErrorRes
            }
        }
        return httpRes
    }

    // eslint-disable-next-line max-len
    public static async postJson(uri: string, postData?: any, queryParam?: any, headers?: RawAxiosRequestHeaders, timeout: number = 3000) {
        if (queryParam) {
            uri += '?' + querystring.stringify(queryParam)
        }

        let httpRes: UrlResonse
        try {
            const res = await axios.post(uri, postData, { headers: headers, timeout: timeout })
            httpRes = new UrlResonse(res)
        } catch (e) {
            if (e instanceof AxiosError) {
                httpRes = defaultErrorRes
                if (e.response) {
                    httpRes = new UrlResonse(e.response)
                }
            } else {
                httpRes = defaultErrorRes
            }
        }
        return httpRes
    }

    // eslint-disable-next-line max-len
    public static async postForm(uri: string, postData?: any, headers?: RawAxiosRequestHeaders, queryParam?: any, timeout: number = 3000) {
        if (queryParam) {
            uri += '?' + querystring.stringify(queryParam)
        }
        let httpRes: UrlResonse
        try {
            const res = await axios.postForm(uri, postData, { headers: headers, timeout: timeout })
            httpRes = new UrlResonse(res)
        } catch (e) {
            if (e instanceof AxiosError) {
                httpRes = defaultErrorRes
                if (e.response) {
                    httpRes = new UrlResonse(e.response)
                }
            } else {
                httpRes = defaultErrorRes
            }
        }
        return httpRes
    }
}