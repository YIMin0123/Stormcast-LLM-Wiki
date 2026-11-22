// 手冊檢查：把文件裡用反引號標起來的檔名、函式名、參數名，一個一個到程式裡找，找不到的列出來（文件寫的東西已經改名或刪掉了）。
//   node tools/docLint.mjs                     檢查 docs/工程架構手冊.md
//   node tools/docLint.mjs docs/水體製作手冊.md …  檢查指定的文件
//   node tools/docLint.mjs --all               檢查 docs/ 底下名字有「手冊／準則／規則／流程／清單」的文件（企劃書、日誌、審查不查）
// 判斷：
//   - 檔案路徑（有 / 或 .js .mjs .md .json .html .css .py .sh 結尾）：照路徑找；只寫檔名的就找整個專案有沒有這個檔名
//   - 名字（foo、foo.bar、foo()、foo(x, z)、#id、.class）：最後一段要在程式裡出現過（整個字）
//   - 其他（有空白、中文、運算式、訊息範例…）：整段字串在程式裡出現過就算對，沒出現也不報（太多是說明用的寫法）
// 找不到就印「文件:行 `內容`」，有找不到的 exit code 1。名字後面 40 字內寫著「已刪」「拿掉」「改名」等的不報（刻意寫的舊名字）；
// 其他誤報（外部程式的名字等）在那一行加 <!-- lint-ok --> 就略過。
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 << 20 }).toString('utf8').split('\0').filter(Boolean);
const SKIP_DIR = /^(docs|參考專案|node_modules|public\/models|tripo_input)\//;
const CODE_EXT = /\.(js|mjs|cjs|html|css|json|sh|py|glsl)$/;
const names = new Set(tracked.map((f) => basename(f)));
const paths = new Set(tracked);
let corpus = '';
for (const f of tracked) {
  if (SKIP_DIR.test(f) || !(CODE_EXT.test(f) || f.startsWith('deploy/'))) continue;
  try { const t = readFileSync(join(ROOT, f), 'utf8'); if (t.length < 4e6) corpus += t + '\n'; } catch { /* 刪掉還沒提交的檔 */ }
}
const lower = corpus.toLowerCase();
const words = new Set(corpus.match(/[A-Za-z_$#.-][\w$-]*/g).flatMap((w) => [w, w.replace(/^[#.]/, '')]));

const FILE = /\.(js|mjs|cjs|md|json|html|css|py|sh|png|jpg|glb|mp3|ogg|txt)$/;
const IDENT = /^[#.]?[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*(?:\(.*\))?$/;
function check(raw) {
  const s = raw.trim();
  if (s.length < 3 || /[　-鿿＀-￯]/.test(s) && !FILE.test(s)) return true;   // 太短、有中文（說明文字）
  if (/:\/\/|^\/|[*<>]|xxx|_N\b|YYYY|^\.\w+$/.test(s)) return true;   // 網址、伺服器路徑、萬用字元、佔位（xxxMap、part_N、YYYY）、只寫副檔名
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) && !corpus.includes(s)) return true;   // 全小寫連字號（技能、分支、外部工具的名字）：程式裡本來就不會有
  if (FILE.test(s) && !/\s/.test(s)) {
    const p = s.replace(/^\.\//, '').replace(/:\d+$/, '');
    if (paths.has(p) || existsSync(join(ROOT, p)) || [...paths].some((t) => t.endsWith('/' + p)) || names.has(p)) return true;
    return /\.json$/.test(p) && corpus.includes(basename(p).replace(/\.json$/, ''));   // 執行時才寫出來的存檔（guild.json、parties.json…）：程式裡有提到就算
  }
  if (/\/$/.test(s) && !/\s/.test(s)) return existsSync(join(ROOT, s)) || words.has(s.split('/').filter(Boolean).pop());   // 資料夾（執行時才建的：程式裡有提到最後一段就算）
  if (IDENT.test(s)) {
    if (/^[a-z]+$/.test(s) && s.length < 6) return true;   // 一般英文小字（kinds、look、put…）：多半是說明，不查
    const last = s.replace(/\(.*\)$/, '').replace(/\[\d+\]/g, '').split('.').filter(Boolean).pop();
    return words.has(last.replace(/^[#.]/, '')) || corpus.includes(s) || (s.includes('-') && lower.includes(s.toLowerCase()));   // 有連字號的（HTTP 標頭、CSS）不分大小寫
  }
  return true;   // 運算式、訊息範例、指令：不查
}

const GONE = /已刪|刪了|刪掉|拿掉|拆掉|移除|改名|原本|以前|歷史/;
const args = process.argv.slice(2);
let docs = args.filter((a) => !a.startsWith('--'));
if (args.includes('--all')) docs = tracked.filter((f) => /^docs\/[^/]*(手冊|準則|規則|流程|清單)[^/]*\.md$/.test(f) && !/原文/.test(f));   // 持續維護的文件（企劃書是歷史紀錄，不查）
if (!docs.length) docs = ['docs/工程架構手冊.md'];

let bad = 0;
for (const doc of docs) {
  const lines = readFileSync(join(ROOT, doc), 'utf8').split('\n');
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fence = !fence; return; }
    if (fence || line.includes('lint-ok') || /^\s*- 20\d\d-\d\d-\d\d/.test(line)) return;   // 「- 2026-11-19：…」這種改版紀錄是歷史，不查
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      if (check(m[1])) continue;
      if (GONE.test(line.slice(Math.max(0, m.index - 30), m.index + m[0].length + 40))) continue;   // 前後緊接著說「已刪」「以前」「拿掉」：刻意寫的舊名字
      bad++;
      console.log(`${doc}:${i + 1}  \`${m[1]}\``);
    }
  });
}
console.log(bad ? `\n${bad} 處在程式裡找不到（改名、刪掉，或是要加 <!-- lint-ok -->）` : '全部找得到');
process.exitCode = bad ? 1 : 0;
