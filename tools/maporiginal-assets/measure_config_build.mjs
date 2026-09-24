/** 发布 JS 实际体积；用 TS parser 分离 System.register 模块，避免把其它生成页的变化算到 O5。 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const arg=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error(`${name} required`);return path.resolve(process.argv[i+1]);};
const names=['decor.data.ts','tops.data.ts','top-scenes.data.ts','manifest.data.ts','MapoDataStore.ts','mapoDecor.ts',
    'mapoTops.ts','mapoPresentation.ts','mapoStaticScene.ts','MapoArtResources.ts','MapoDecorRenderer.ts','MapoTopRenderer.ts'];
function measure(base) {
    const folder=path.join(base,'assets/main'),files=fs.readdirSync(folder).filter(n=>/^index\..*\.js$/.test(n));
    if(files.length!==1)throw Error('Expected one current main JS');
    const bytes=fs.readFileSync(path.join(folder,files[0])),code=bytes.toString('utf8');
    const ast=ts.createSourceFile(files[0],code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS), modules={};
    for(const stmt of ast.statements) {
        if(!ts.isExpressionStatement(stmt)||!ts.isCallExpression(stmt.expression))continue;
        const call=stmt.expression;
        if(call.expression.getText(ast)!=='System.register'||!ts.isStringLiteral(call.arguments[0]))continue;
        const name=call.arguments[0].text.replace('chunks:///_virtual/','');
        const data=Buffer.from(stmt.getText(ast));
        modules[name]={bytes:data.length,gzipBytes:gzipSync(data,{level:9}).length,sha256:createHash('sha256').update(data).digest('hex')};
    }
    for(const name of names.filter(n=>!['top-scenes.data.ts','mapoPresentation.ts'].includes(n)))if(!modules[name])throw Error(`Missing measured module ${name}`);
    return {file:path.join(folder,files[0]),bytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length,
        sha256:createHash('sha256').update(bytes).digest('hex'),modules};
}
const before=measure(arg('--before')),after=measure(arg('--after'));
const changes=names.map(name=>({name,before:before.modules[name]?.bytes??0,after:after.modules[name]?.bytes??0}));
const otherChanges=[...new Set([...Object.keys(before.modules),...Object.keys(after.modules)])].filter(n=>!names.includes(n)&&before.modules[n]?.sha256!==after.modules[n]?.sha256)
    .map(name=>({name,before:before.modules[name]?.bytes??0,after:after.modules[name]?.bytes??0}));
const report={basis:'Actual minified release JS; gzip level 9 is an estimate. Scoped delta excludes other modules.',
    before,after,changes,scopedBytesSaved:changes.reduce((n,r)=>n+r.before-r.after,0),otherChanges};
const out=arg('--out');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before:before.bytes,after:after.bytes,scopedBytesSaved:report.scopedBytesSaved,otherChanges}));
