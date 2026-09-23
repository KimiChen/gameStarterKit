import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { identityKeyIsPageScoped, linkedFileGuid } from "../../node_modules/web-ui-to-psd/lib/uniflex-linked-psd.mjs";
import { decodeUniFlexMetadata } from "../../node_modules/web-ui-to-psd/lib/uniflex-metadata.mjs";
import { parseLayerIdentity } from "../../node_modules/web-ui-to-psd/lib/uniflex-identity.mjs";
import {
    artPsdPath, fileSha256, listArtComponentPsds,
    loadArtCatalog, pathExists,
} from "./uniflex-art.mjs";

const require = createRequire(resolve(import.meta.dirname, "../../node_modules/web-ui-to-psd/package.json"));
const { readPsd } = require("ag-psd");

const READ_LINKS = {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
};

// Photoshop treats an empty childDocumentID as "assign this on first save".
// Saving one smart object can then retarget every instance that shares the
// link, which is how backpack tabs became ResourceCounter.psd.
export function componentDocumentId(key) {
    const hex = createHash("sha256").update(`uniflex-component-doc:${key}`).digest("hex");
    return `xmp.did:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function psdHasPageScopedIdentity(bytes) {
    const psd = readPsd(bytes, READ_LINKS);
    const snapshot = decodeUniFlexMetadata(psd.imageResources?.xmpMetadata);
    return (snapshot?.nodes || []).some((node) => identityKeyIsPageScoped(node.identity?.key));
}

export function componentGuid(key) {
    return linkedFileGuid(`uniflex-component:${key}`);
}

export function componentKeyFromRelative(relativePath) {
    const base = String(relativePath || "").split(/[\\/]/u).pop() || "";
    const key = base.replace(/\.psd$/iu, "");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(key))
        throw new Error(`Linked PSD path does not name a component: ${relativePath}`);
    return key;
}

// `Tab:Backpack/.../Item:0/Tab` and `Tab/_` are both the Tab component.
export function definitionKeyFromIdentity(key) {
    const head = String(key || "").split("/")[0];
    const definition = head.split(":")[0];
    if (!definition) throw new Error(`Missing component identity: ${key}`);
    return definition;
}

export function withDocumentId(xml, id) {
    const attr = `xmpMM:DocumentID="${id}"`;
    if (xml.includes(attr)) return xml;
    if (/xmpMM:DocumentID="[^"]*"/u.test(xml))
        return xml.replace(/xmpMM:DocumentID="[^"]*"/u, attr);
    if (/<xmpMM:DocumentID>/u.test(xml))
        return xml.replace(/<xmpMM:DocumentID>[^<]*<\/xmpMM:DocumentID>/u, `<xmpMM:DocumentID>${id}</xmpMM:DocumentID>`);
    const xmlns = xml.includes("xmlns:xmpMM=") ? "" : ` xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"`;
    const next = xml.replace("<rdf:Description ", `<rdf:Description${xmlns} ${attr} `);
    if (next === xml) throw new Error("UniFlex XMP has no rdf:Description.");
    return next;
}

function u32(buf, offset) {
    return buf.readUInt32BE(offset);
}

export function psdSections(buf) {
    if (buf.toString("ascii", 0, 4) !== "8BPS") throw new Error("Not a PSD.");
    if (buf.readUInt16BE(4) !== 1) throw new Error("Only PSD (not PSB) link binding is supported.");
    let offset = 26;
    const colorLen = u32(buf, offset);
    offset += 4 + colorLen;
    const resourceLengthOffset = offset;
    const resourceLength = u32(buf, offset);
    offset += 4;
    const resourceStart = offset;
    offset += resourceLength;
    const layerLengthOffset = offset;
    const layerLength = u32(buf, offset);
    offset += 4;
    return {
        resourceLengthOffset,
        resourceStart,
        resourceLength,
        layerLengthOffset,
        layerStart: offset,
        layerEnd: offset + layerLength,
    };
}

function walkResources(buf, start, length) {
    const end = start + length;
    let offset = start;
    const blocks = [];
    while (offset < end) {
        const signature = buf.toString("ascii", offset, offset + 4);
        if (signature !== "8BIM" && signature !== "8B64")
            throw new Error(`Bad image resource at ${offset}.`);
        let cursor = offset + 6;
        let nameLength = buf[cursor];
        cursor += 1 + nameLength;
        while (++nameLength % 2) cursor += 1;
        const size = u32(buf, cursor);
        const data = cursor + 4;
        let next = data + size;
        if (size % 2) next += 1;
        if (next > end) throw new Error("Image resource exceeds its section.");
        blocks.push({ id: buf.readUInt16BE(offset + 4), sizeOffset: cursor, size, data, next });
        offset = next;
    }
    if (offset !== end) throw new Error("Image resources do not fill the section.");
    return blocks;
}

export function stampComponentDocument(buffer, key) {
    const id = componentDocumentId(key);
    const sections = psdSections(buffer);
    const blocks = walkResources(buffer, sections.resourceStart, sections.resourceLength);
    const xmp = blocks.find((block) => block.id === 1060);
    if (!xmp) throw new Error(`${key}: component PSD has no XMP resource.`);
    const xml = withDocumentId(buffer.toString("utf8", xmp.data, xmp.data + xmp.size), id);
    if (xml === buffer.toString("utf8", xmp.data, xmp.data + xmp.size)) return buffer;
    const payload = Buffer.from(xml);
    const pad = payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
    const out = Buffer.concat([
        buffer.subarray(0, xmp.data),
        payload,
        pad,
        buffer.subarray(xmp.next),
    ]);
    out.writeUInt32BE(payload.length, xmp.sizeOffset);
    out.writeUInt32BE(sections.resourceLength + (out.length - buffer.length), sections.resourceLengthOffset);
    return out;
}

function unicodeField(text) {
    const out = Buffer.alloc(4 + (text.length + 1) * 2);
    out.writeUInt32BE(text.length + 1, 0);
    for (let index = 0; index < text.length; index += 1)
        out.writeUInt16BE(text.charCodeAt(index), 4 + index * 2);
    return out;
}

function additionalBlocks(buf, sections) {
    let offset = sections.layerStart;
    const layerInfo = u32(buf, offset);
    offset += 4 + layerInfo + (layerInfo % 2);
    const maskLength = u32(buf, offset);
    offset += 4 + maskLength;
    const blocks = [];
    while (offset + 12 <= sections.layerEnd) {
        const signature = buf.toString("ascii", offset, offset + 4);
        if (signature !== "8BIM" && signature !== "8B64")
            throw new Error(`Bad additional layer info at ${offset}.`);
        const key = buf.toString("ascii", offset + 4, offset + 8);
        const length = u32(buf, offset + 8);
        const data = offset + 12;
        let next = data + length;
        if (length % 2) next += 1;
        if (next > sections.layerEnd) throw new Error(`${key} exceeds the layer section.`);
        blocks.push({ offset, key, length, data, next });
        offset = next;
    }
    if (offset !== sections.layerEnd) throw new Error("Additional layer info does not fill the layer section.");
    return blocks;
}

function linkedItems(buf, block) {
    let offset = block.data;
    const end = block.data + block.length;
    const items = [];
    while (offset + 8 <= end) {
        if (u32(buf, offset) !== 0) throw new Error("Linked file is larger than 4GB.");
        const size = u32(buf, offset + 4);
        const pad = size % 4 ? 4 - (size % 4) : 0;
        if (offset + 8 + size + pad > end) throw new Error("Linked file item exceeds lnkE.");
        items.push({ offset, size, pad });
        offset += 8 + size + pad;
    }
    if (offset !== end) throw new Error("lnkE items do not fill the block.");
    return items;
}

function rewriteItem(body, currentId, nextId, fileSize) {
    const tail = 4 + (currentId.length + 1) * 2;
    if (body.length < tail + 8) throw new Error("Linked file item is too small for a document id.");
    const unicodeAt = body.length - tail;
    if (body.readUInt32BE(unicodeAt) !== currentId.length + 1)
        throw new Error("Linked file document id does not match the parsed PSD.");
    if (body.toString("ascii", 0, 4) !== "liFE") throw new Error("Expected an external linked file.");
    if (body.readUInt32BE(4) !== 5) throw new Error("Only version-5 linked files can be bound in place.");
    const prefix = body.subarray(0, unicodeAt - 8);
    const suffix = Buffer.alloc(8 + 4 + (nextId.length + 1) * 2);
    suffix.writeUInt32BE(fileSize, 4);
    unicodeField(nextId).copy(suffix, 8);
    return Buffer.concat([prefix, suffix]);
}

// `targets` matches external linked files in file order.
export function bindExternalLinks(buffer, targets) {
    const psd = readPsd(buffer, READ_LINKS);
    const externals = (psd.linkedFiles || []).filter((file) => file.linkedFile?.relativePath);
    if (externals.length !== targets.length)
        throw new Error(`Expected ${externals.length} link targets, got ${targets.length}.`);
    if (!externals.length) return buffer;
    const sections = psdSections(buffer);
    const block = additionalBlocks(buffer, sections).find((item) => item.key === "lnkE");
    if (!block) throw new Error("PSD links a file but has no lnkE block.");
    const items = linkedItems(buffer, block);
    if (items.length !== externals.length)
        throw new Error(`lnkE has ${items.length} items for ${externals.length} links.`);
    const parts = [];
    let changed = false;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const external = externals[index];
        const target = targets[index];
        const currentId = external.childDocumentID || "";
        const currentSize = external.linkedFile?.fileSize || 0;
        const body = buffer.subarray(item.offset + 8, item.offset + 8 + item.size);
        if (currentId === target.documentId && currentSize === target.fileSize) {
            parts.push(buffer.subarray(item.offset, item.offset + 8 + item.size + item.pad));
            continue;
        }
        changed = true;
        const next = rewriteItem(body, currentId, target.documentId, target.fileSize);
        const pad = next.length % 4 ? 4 - (next.length % 4) : 0;
        const header = Buffer.alloc(8);
        header.writeUInt32BE(next.length, 4);
        parts.push(header, next, Buffer.alloc(pad));
    }
    if (!changed) return buffer;
    const data = Buffer.concat(parts);
    const oldSpan = block.next - block.offset;
    const newSpan = 12 + data.length + (data.length % 2);
    const out = Buffer.concat([
        buffer.subarray(0, block.offset),
        Buffer.from("8BIMlnkE"),
        (() => {
            const length = Buffer.alloc(4);
            length.writeUInt32BE(data.length, 0);
            return length;
        })(),
        data,
        data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
        buffer.subarray(block.next),
    ]);
    if (out.length !== buffer.length + (newSpan - oldSpan))
        throw new Error("Link block rewrite changed the file by an unexpected amount.");
    const layerLength = sections.layerEnd - sections.layerStart;
    out.writeUInt32BE(layerLength + (newSpan - oldSpan), sections.layerLengthOffset);
    return out;
}

function readLinks(buffer) {
    return readPsd(buffer, READ_LINKS);
}

export function auditPsdLinks(psd, label, sizeOf) {
    const problems = [];
    const keyById = new Map();
    for (const file of psd.linkedFiles || []) {
        const relativePath = file.linkedFile?.relativePath;
        if (!relativePath) continue;
        let key;
        try {
            key = componentKeyFromRelative(relativePath);
        } catch (error) {
            problems.push(`${label}: ${error.message}`);
            continue;
        }
        keyById.set(file.id, key);
        if (file.id !== componentGuid(key))
            problems.push(`${label}: ${relativePath} is stored under id ${file.id}, not ${key}.`);
        if ((file.childDocumentID || "") !== componentDocumentId(key))
            problems.push(`${label}: ${key} has no stable document id (${file.childDocumentID || "empty"}).`);
        const actual = sizeOf?.(relativePath);
        if (typeof actual === "number" && file.linkedFile.fileSize !== actual)
            problems.push(`${label}: ${key} link size is ${file.linkedFile.fileSize}, file is ${actual}.`);
    }
    const walk = (layer) => {
        let parsed;
        try {
            parsed = parseLayerIdentity(layer?.name || "");
        } catch (error) {
            problems.push(`${label}: ${error.message}`);
            parsed = null;
        }
        const role = parsed?.identity?.role;
        if (layer?.placedLayer && (role === "component" || role === "reference")) {
            const definition = definitionKeyFromIdentity(parsed.identity.key);
            if (layer.placedLayer.id !== componentGuid(definition)) {
                const actual = keyById.get(layer.placedLayer.id) || layer.placedLayer.id;
                problems.push(`${label}: layer "${layer.name}" is ${definition} but links ${actual}.`);
            }
        }
        for (const child of layer?.children || []) walk(child);
    };
    for (const child of psd.children || []) walk(child);
    return problems;
}

async function artPsdFiles(root) {
    const catalog = await loadArtCatalog(root);
    const files = [];
    for (const page of catalog.pages) {
        const psd = artPsdPath(root, page);
        if (await pathExists(psd)) files.push(psd);
    }
    files.push(...await listArtComponentPsds(root));
    return files;
}

function externalTargets(buffer, file) {
    const psd = readLinks(buffer);
    return (psd.linkedFiles || [])
        .filter((item) => item.linkedFile?.relativePath)
        .map((item) => resolve(dirname(file), item.linkedFile.relativePath));
}

async function rememberHash(file, before, after) {
    const artPath = resolve(dirname(file), "art.json");
    if (!await pathExists(artPath)) return;
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    let changed = false;
    for (const block of ["export", "import"]) {
        if (art[block]?.psdSha256 && art[block].psdSha256 === before) {
            art[block].psdSha256 = after;
            art[block].at = new Date().toISOString();
            changed = true;
        }
    }
    if (changed) await writeFile(artPath, `${JSON.stringify(art, null, 2)}\n`);
}

export async function bindArtLinkIdentities(root) {
    const files = await artPsdFiles(root);
    const buffers = new Map();
    const links = new Map();
    for (const file of files) {
        const buffer = readFileSync(file);
        buffers.set(file, buffer);
        links.set(file, externalTargets(buffer, file));
    }
    const componentDir = resolve(root, "apps/art/uniflex/components");
    const pending = new Set();
    for (const file of files) {
        const key = basename(file, ".psd");
        if (dirname(dirname(file)) !== componentDir) continue;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(key)) continue;
        const stamped = stampComponentDocument(buffers.get(file), key);
        if (stamped !== buffers.get(file)) pending.add(file);
        buffers.set(file, stamped);
    }
    const done = new Set();
    const visiting = new Set();
    const order = [];
    const visit = (file) => {
        if (done.has(file)) return;
        if (!buffers.has(file)) return;
        if (visiting.has(file)) throw new Error(`Component links cycle through ${file}.`);
        visiting.add(file);
        for (const target of links.get(file) || []) visit(target);
        visiting.delete(file);
        done.add(file);
        order.push(file);
    };
    for (const file of files) visit(file);
    const changed = [];
    for (const file of order) {
        const current = buffers.get(file);
        const targets = (links.get(file) || []).map((target) => ({
            documentId: componentDocumentId(componentKeyFromRelative(target)),
            fileSize: (buffers.get(target) || readFileSync(target)).length,
        }));
        const bound = bindExternalLinks(current, targets);
        if (bound === current) continue;
        pending.delete(file);
        const before = await fileSha256(file);
        const temporary = `${file}.tmp`;
        await writeFile(temporary, bound);
        await rename(temporary, file);
        buffers.set(file, bound);
        changed.push(file);
        await rememberHash(file, before, await fileSha256(file));
    }
    for (const file of pending) {
        const current = buffers.get(file);
        const before = await fileSha256(file);
        const temporary = `${file}.tmp`;
        await writeFile(temporary, current);
        await rename(temporary, file);
        changed.push(file);
        await rememberHash(file, before, await fileSha256(file));
    }
    return changed;
}

export async function auditArtLinks(root) {
    const catalog = await loadArtCatalog(root);
    const problems = [];
    const files = [];
    for (const page of catalog.pages) {
        const psd = artPsdPath(root, page);
        if (await pathExists(psd)) files.push(psd);
    }
    files.push(...await listArtComponentPsds(root));
    const sizes = new Map();
    for (const file of files) sizes.set(file, (await stat(file)).size);
    for (const file of files) {
        const psd = readLinks(readFileSync(file));
        const label = file.slice(root.length + 1);
        problems.push(...auditPsdLinks(psd, label, (relativePath) => sizes.get(resolve(dirname(file), relativePath))));
    }
    return problems;
}
