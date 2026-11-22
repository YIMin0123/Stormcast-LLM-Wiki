// Wiki 檢查（LLM Wiki 的 Lint 操作）
//   node tools/wiki_lint.mjs
// 檢查項目：
//   A. 格式：每頁有 title / type / sources，sources 列的 raw 檔都存在
//   B. 連結：[[頁名]] 都連得到；每頁都在 index 裡；每頁至少連出一頁、至少被一頁連到（不能有孤兒頁）
//   C. 事實：頁面裡的 commit 編號、反引號標的名字、兩位數以上的數字，都要在這頁 sources 列的 raw 檔裡找得到
//      （「背景（一般知識）」那一節不查；那是 SCHEMA 允許的一般知識）
// 有錯就 exit code 1，並印「頁名:行 問題」。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIKI = join(ROOT, 'wiki');
const SPECIAL = new Set(['index', 'log', 'SCHEMA']);
const files = readdirSync(WIKI).filter((f) => f.endsWith('.md'));
const names = new Set(files.map((f) => f.slice(0, -3)));
const pages = [...names].filter((n) => !SPECIAL.has(n));

const errs = [];
const err = (page, line, msg) => errs.push(`${page}:${line}  ${msg}`);
const inbound = new Map(pages.map((p) => [p, 0]));
const text = Object.fromEntries([...names].map((n) => [n, readFileSync(join(WIKI, n + '.md'), 'utf8').replace(/\r\n/g, '\n')]));   // Windows 換行也吃

// B. 連結
for (const n of names) {
  text[n].split('\n').forEach((line, i) => {
    for (const m of line.replace(/`[^`]+`/g, '').matchAll(/\[\[([^\]]+)\]\]/g)) {   // 反引號裡的是寫法示範，不是連結
      if (!names.has(m[1])) err(n, i + 1, `[[${m[1]}]] 連不到（沒有這頁）`);
      else if (m[1] !== n && inbound.has(m[1]) && n !== 'index' && n !== 'log') inbound.set(m[1], inbound.get(m[1]) + 1);
    }
  });
}
for (const p of pages) {
  if (!text.index.includes(`[[${p}]]`)) err(p, 1, '沒有列在 index.md');
  if (!/\[\[[^\]]+\]\]/.test(text[p])) err(p, 1, '沒有連到任何一頁');
  if (!inbound.get(p)) err(p, 1, '孤兒頁：沒有別的頁連到它（index、log 不算）');
}

// A. 格式  ＋  C. 事實
let facts = 0;
for (const p of pages) {
  const fm = text[p].match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { err(p, 1, '缺開頭的 --- 區塊'); continue; }
  const field = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1];
  for (const k of ['title', 'type', 'sources']) if (!field(k)) err(p, 1, `缺 ${k}:`);
  const srcs = (field('sources') || '').split(',').map((s) => s.trim()).filter(Boolean);
  let corpus = '';
  for (const s of srcs) {
    if (!existsSync(join(ROOT, s))) err(p, 1, `sources 的 ${s} 不存在`);
    else corpus += readFileSync(join(ROOT, s), 'utf8') + '\n';
  }
  const flat = corpus.replace(/[,，]/g, '');   // 「1,200」也算 1200
  let skip = false;
  text[p].split('\n').forEach((line, i) => {
    if (i < fm[0].split('\n').length) return;
    if (/^#+ /.test(line)) skip = /背景（一般知識）/.test(line);
    if (/^背景（一般知識）/.test(line)) return;
    if (skip) return;
    const body = line.replace(/\[\[[^\]]+\]\]/g, '');   // 頁名不查
    for (const m of body.matchAll(/`([^`]+)`/g)) {
      facts++;
      if (/^raw\/\d\d$/.test(m[1])) { if (!srcs.some((s) => s.startsWith(m[1] + '-'))) err(p, i + 1, `引用 ${m[1]} 不在這頁的 sources 裡`); continue; }   // `raw/03` 這種引用寫法
      if (!corpus.includes(m[1])) err(p, i + 1, `反引號 \`${m[1]}\` 在來源裡找不到`);
    }
    const noCode = body.replace(/`[^`]+`/g, '');
    for (const m of noCode.matchAll(/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7}\b/g)) {
      facts++;
      if (!corpus.includes(m[0])) err(p, i + 1, `提交編號 ${m[0]} 在來源裡找不到`);
    }
    for (const m of noCode.replace(/\b[0-9a-f]{7}\b/g, '').matchAll(/\d[\d,]*\d/g)) {
      const num = m[0].replace(/,/g, '');
      facts++;
      // 前後不能接數字：37 不能用 3702 的一部分過關
      if (!new RegExp(`(?<!\\d)${num}(?!\\d)`).test(flat)) err(p, i + 1, `數字 ${m[0]} 在來源裡找不到`);
    }
  });
}

console.log(`檢查 ${pages.length} 頁、${facts} 個事實（數字／提交編號／程式名稱）`);
if (errs.length) { console.log(errs.join('\n')); console.log(`\n✗ ${errs.length} 個問題`); process.exitCode = 1; }
else console.log('✓ 全部通過');
