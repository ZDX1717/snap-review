// ==================== docx 纯前端文本抽取(零依赖) ====================
// 职责:docx(Office Open XML zip 容器) -> 纯文本,供导入管道复用 parser。
// 允许:DecompressionStream / DOMParser 等浏览器原生 API。禁止:state / storage / parser 反向依赖。
// 仅支持 .docx;老版二进制 .doc 是 OLE 容器,无法在零依赖前提下解析,由调用方引导用户另存。

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// 惰性取 TextDecoder:vm 测试沙箱的全局里没有它,但沙箱内不会真正调用解析函数
function decoder() {
    return new globalThis.TextDecoder();
}

async function inflateRaw(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 解析 zip 中央目录并解出 word/document.xml 原始 XML。
// 支持 store(0)与 deflate(8);不支持 zip64(docx 远小于 4GB 边界)。
export async function docxToXml(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const minEocd = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= minEocd; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 docx 文件');
    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
        if (ptr + 46 > bytes.length || dv.getUint32(ptr, true) !== 0x02014b50) break;
        const method = dv.getUint16(ptr + 10, true);
        const compSize = dv.getUint32(ptr + 20, true);
        const nameLen = dv.getUint16(ptr + 28, true);
        const extraLen = dv.getUint16(ptr + 30, true);
        const commentLen = dv.getUint16(ptr + 32, true);
        const localOff = dv.getUint32(ptr + 42, true);
        const name = decoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
        ptr += 46 + nameLen + extraLen + commentLen;
        if (name !== 'word/document.xml') continue;
        const lhNameLen = dv.getUint16(localOff + 26, true);
        const lhExtraLen = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + lhNameLen + lhExtraLen;
        const data = bytes.subarray(start, start + compSize);
        if (method === 0) return decoder().decode(data);
        if (method === 8) return decoder().decode(await inflateRaw(data));
        throw new Error('docx 使用的压缩方式不受支持');
    }
    throw new Error('docx 中没有正文(document.xml)');
}

// document.xml -> 纯文本:段落为行,w:tab->空格,w:br/cr->换行,表格行内单元格用空格连接。
// 与 corpus/docx2txt.py 同一套抽取语义(已在真实语料上验证)。
export function docxXmlToText(xml, dom = globalThis) {
    const doc = dom.DOMParser
        ? new dom.DOMParser().parseFromString(xml, 'application/xml')
        : dom.parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
    if (!body) throw new Error('docx 正文结构异常');
    const lines = [];
    const paraText = (p) => {
        let s = '';
        for (const node of p.getElementsByTagNameNS('*', '*')) {
            if (node.localName === 't') s += node.textContent || '';
            else if (node.localName === 'br' || node.localName === 'cr') s += '\n';
            else if (node.localName === 'tab') s += ' ';
        }
        return s;
    };
    for (const child of body.children) {
        if (child.localName === 'p') {
            const t = paraText(child).replace(/\s+$/, '');
            if (t.trim()) lines.push(t);
        } else if (child.localName === 'tbl') {
            for (const tr of child.children) {
                if (tr.localName !== 'tr') continue;
                const cells = [];
                for (const tc of tr.children) {
                    if (tc.localName !== 'tc') continue;
                    const cellText = [...tc.children]
                        .filter(p => p.localName === 'p')
                        .map(p => paraText(p).trim())
                        .filter(Boolean)
                        .join(' ');
                    if (cellText) cells.push(cellText);
                }
                if (cells.length) lines.push(cells.join(' '));
            }
        }
    }
    return lines.join('\n');
}

export async function docxToText(arrayBuffer, dom = globalThis) {
    return docxXmlToText(await docxToXml(arrayBuffer), dom);
}
