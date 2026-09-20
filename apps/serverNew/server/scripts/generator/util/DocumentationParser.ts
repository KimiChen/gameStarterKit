import { JSDocableNode } from 'ts-morph'

export interface DocSegment {
    at: string
    type: string
    name: string
    desc: string
}

export function parseDoc(docText: string): DocSegment[] {
    const docSegments: DocSegment[] = []
    const segments = docText.split('\n')

    for (let comment of segments) {
        comment = trimDocTag(comment, [' ', '/', '*', '{', '}'])

        if (comment == '/' || comment == '//' || comment == '') {
            continue
        }

        if (comment[0] != '@') {
            docSegments.push({
                at: '',
                type: '',
                name: '',
                desc: comment,
            })
            continue
        }

        comment = comment.replace(/\s+/g, ' ')
        const comments = comment.split(' ', 4)

        const docSegment = {
            at: comments[0] ?? '',
            name: comments[1] ?? '',
            desc: comments[2] ?? '',
            type: '',
        }

        if (comments.length == 2) {
            docSegment.at = comments[0]
            docSegment.name = ''
            docSegment.desc = comments[1]
        }

        docSegments.push(docSegment)
    }
    return docSegments
}

function trimDocTag(str: string, chars: string[]) {
    str = str.trim()
    if (str.length == 0) {
        return str
    }
    const ol = str.length
    if (chars.includes(str[0])) {
        str = str.substring(1)
    }
    if (str.length == 0) {
        return str
    }
    if (chars.includes(str[str.length - 1])) {
        str = str.substring(0, str.length - 1)
    }
    if (ol != str.length) {
        str = trimDocTag(str, chars)
    }
    return str
}

export function getComment(prop: JSDocableNode) {
    // 获取注释
    const docArray = prop.getJsDocs()
    let doc = ''
    if (docArray.length > 0) {
        doc = docArray[0].getFullText()
    }
    return doc.replace(/[/*]/g, '').trim()
}

export function getCommentWrapped(comment: string | undefined) {
    if (!comment) return ''
    return '/**\n    * ' + comment.replaceAll('\n', '\n    * ') + '\n    */'
}
