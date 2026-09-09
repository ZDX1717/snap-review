// docx 抽取测试:纯 JS 构造 zip 夹具(store/deflate 两种压缩),验证 zip 层;
// XML->文本层依赖 DOMParser,浏览器内生效(逻辑与 corpus/docx2txt.py 同语义,已真实语料验证)
import test from 'node:test';
import assert from 'node:assert';
import zlib from 'node:zlib';
import { docxToXml } from '../src/docx.js';

function crc32(buf) {
    if (!crc32.table) {
        crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            crc32.table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
}

// 构造最小 zip(仅 store/deflate,无 zip64)
function makeZip(entries) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
        const nameBytes = enc.encode(e.name);
        const method = e.deflate ? 8 : 0;
        const data = e.deflate ? zlib.deflateRawSync(e.data) : e.data;
        const crc = crc32(e.data);
        const lh = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(8, method, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, e.data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lh.set(nameBytes, 30);
        chunks.push(lh, data);
        const ch = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(10, method, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, e.data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        central.push(ch);
        offset += lh.length + data.length;
    }
    const centralStart = offset;
    const centralLen = central.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralLen, true);
    ev.setUint32(16, centralStart, true);
    const total = new Uint8Array(offset + centralLen + 22);
    let p = 0;
    for (const c of [...chunks, ...central, eocd]) { total.set(c, p); p += c.length; }
    return total;
}

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1. 测试题（A）</w:t></w:r></w:p><w:p><w:r><w:t>答案：A</w:t></w:r></w:p></w:body></w:document>`;

test('docx 抽取:deflate 压缩条目(zip 方法 8)', async () => {
    const enc = new TextEncoder();
    const zip = makeZip([
        { name: '[Content_Types].xml', data: enc.encode('<Types/>') },
        { name: 'word/document.xml', data: enc.encode(XML), deflate: true },
    ]);
    const out = await docxToXml(zip.buffer);
    assert.ok(out.includes('测试题'));
    assert.ok(out.includes('document.xml') === false);
});

test('docx 抽取:store 未压缩条目(zip 方法 0)', async () => {
    const enc = new TextEncoder();
    const zip = makeZip([{ name: 'word/document.xml', data: enc.encode(XML) }]);
    const out = await docxToXml(zip.buffer);
    assert.ok(out.includes('答案：A'));
});

test('docx 抽取:非 zip 输入明确报错', async () => {
    const bad = new TextEncoder().encode('这不是 zip,是纯文本题目');
    await assert.rejects(() => docxToXml(bad.buffer), /不是有效的 docx/);
});
