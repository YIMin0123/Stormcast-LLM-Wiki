// 簡報檢查
//   node tools/slide_check.mjs            檢查 slides/index.html
//   node tools/slide_check.mjs --shots    另外把每張投影片截圖到 紀錄/截圖/
// 檢查項目：
//   1. 對應：每張投影片都有 data-wiki，列的頁都存在於 wiki/
//   2. 事實：投影片上的數字（兩位數以上）、提交編號、<code> 內容，都要在它列的 Wiki 頁裡找得到（不能憑空出現）
//   3. 術語：名詞第一次出現的那張投影片要有解釋（<dfn>名詞</dfn>，或名詞後面緊接「（」說明）
//   4. 版面：用無頭 Edge 以 1280×720 畫每一張，內容不能超出投影片、不能壓到底下的來源列
// 有錯就 exit code 1。
import { readFileSync, existsSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'slides', 'index.html');
const html = readFileSync(HTML, 'utf8');
const wiki = (p) => readFileSync(join(ROOT, 'wiki', p + '.md'), 'utf8');
const TERMS = JSON.parse(readFileSync(join(ROOT, 'tools', 'terms.json'), 'utf8')).terms;   // 跟 outline_check 共用

const errs = [];
const slides = [...html.matchAll(/<section class="slide[^"]*" data-wiki="([^"]+)">([\s\S]*?)<\/section>/g)]
  .map((m, i) => ({ n: i + 1, pages: m[1].split(','), html: m[2], text: m[2].replace(/<\/?(td|th|tr|li|p|div|h\d|br|ul|ol|table)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ') }));
const err = (s, msg) => errs.push(`第 ${s.n} 張  ${msg}`);

// 1. 對應  2. 事實
let facts = 0;
for (const s of slides) {
  const missing = s.pages.filter((p) => !existsSync(join(ROOT, 'wiki', p + '.md')));
  missing.forEach((p) => err(s, `data-wiki 的「${p}」不是 Wiki 頁`));
  if (missing.length || s.pages.includes('index')) continue;   // 來源頁是動態列表，不查事實
  const src = s.pages.map(wiki).join('\n').replace(/[,，]/g, '');
  for (const m of s.html.matchAll(/<code[^>]*>([^<]+)<\/code>/g)) {
    facts++;
    if (!src.includes(m[1])) err(s, `<code>${m[1]}</code> 在 Wiki 頁（${s.pages.join('、')}）裡找不到`);
  }
  const plain = s.text.replace(/\b[0-9a-f]{7}\b/g, (h) => { facts++; if (!src.includes(h)) err(s, `提交編號 ${h} 在 Wiki 頁裡找不到`); return ' '; });
  for (const m of plain.matchAll(/\d[\d,]*\d/g)) {
    const num = m[0].replace(/,/g, '');
    facts++;
    if (!new RegExp(`(?<!\\d)${num}(?!\\d)`).test(src)) err(s, `數字 ${m[0]} 在 Wiki 頁（${s.pages.join('、')}）裡找不到`);
  }
}

// 1b. 對應大綱：--outline 給的話，每張的 Wiki 頁要跟大綱一樣（大綱是 Query 的結果，簡報不能自己換來源）
const oi = process.argv.indexOf('--outline');
if (oi > 0) {
  const rows = readFileSync(join(ROOT, process.argv[oi + 1]), 'utf8').replace(/\r/g, '').split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
  for (const s of slides) {
    const row = rows.find((r) => +r[1] === s.n);
    if (!row) { err(s, '大綱裡沒有這一張'); continue; }
    const want = row[4].split('、').map((x) => x.trim()).sort().join('、'), got = [...s.pages].sort().join('、');
    if (want !== got) err(s, `Wiki 頁跟大綱不一樣：大綱「${want}」，簡報「${got}」`);
  }
  if (rows.length !== slides.length) errs.push(`大綱 ${rows.length} 張，簡報 ${slides.length} 張`);
}

// 3. 術語
for (const t of TERMS) {
  const first = slides.find((s) => s.text.includes(t));
  if (!first) continue;
  const ok = slides.slice(0, first.n).some((s) => s.html.includes(`<dfn>${t}</dfn>`)) || first.text.includes(t + '（') || first.html.includes(`<dfn>${t}</dfn>`);
  if (!ok) err(first, `術語「${t}」第一次出現在這張，但沒有解釋（加 <dfn>${t}</dfn> 或「${t}（說明）」）`);
}

// 4. 版面
const shots = process.argv.includes('--shots');
const PORT = 9341, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'edge-'))}`, '--window-size=1400,800', 'about:blank'], { stdio: 'ignore' });
let tgt;
for (let i = 0; i < 50 && !tgt; i++) { await sleep(300); try { tgt = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
await send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 760, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(HTML).href });
await sleep(2500);
await run('document.fonts.ready.then(() => 1)');
if (shots) mkdirSync(join(ROOT, '紀錄', '截圖'), { recursive: true });
const total = await run('document.querySelectorAll(".slide").length');
for (let i = 0; i < total; i++) {
  const bad = await run(`(() => {
    show(${i}); const s = document.querySelectorAll('.slide')[${i}];
    const k = s.getBoundingClientRect().width / 1280, box = s.getBoundingClientRect(), foot = s.querySelector('.src').getBoundingClientRect();
    const out = [];
    for (const el of s.querySelectorAll('*')) {
      if (el.closest('.src') || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '');
      const what = (el.textContent || el.alt || '').trim().slice(0, 18);
      if (r.right > box.right - 1 || r.bottom > box.bottom - 1) out.push('超出投影片：' + tag + '「' + what + '」');
      else if (r.bottom > foot.top + 1 && r.height < 600 * k && !s.classList.contains('cover')) out.push('壓到來源列（超出 ' + Math.round((r.bottom - foot.top) / k) + 'px）：' + tag + '「' + what + '」');
    }
    let low = 0;
    for (const el of s.querySelectorAll('*')) if (!el.closest('.src') && el.getClientRects().length && !el.hidden) low = Math.max(low, el.getBoundingClientRect().bottom);
    const used = (low - box.top) / box.height;
    if (used < 0.65 && !s.classList.contains('cover')) out.push('警告：內容只用到投影片上方 ' + Math.round(used * 100) + '%，下半部空白');
    return [...new Set(out)].slice(0, 4);
  })()`);
  bad.forEach((b) => err({ n: i + 1 }, b));
  if (shots) {
    await sleep(150);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(ROOT, '紀錄', '截圖', `${String(i + 1).padStart(2, '0')}.png`), Buffer.from(r.result.data, 'base64'));
  }
}
ws.close(); edge.kill();

console.log(`檢查 ${slides.length} 張投影片、${facts} 個事實、${TERMS.length} 個術語、版面 ${total} 張`);
if (errs.length) { console.log(errs.join('\n')); console.log(`\n✗ ${errs.length} 個問題`); process.exitCode = 1; }
else console.log('✓ 全部通過');
process.exit();
