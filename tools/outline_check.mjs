// 大綱檢查（生成簡報之前跑）
//   node tools/outline_check.mjs 紀錄/08-簡報大綱-v2.md
// 檢查項目：
//   1. 每張投影片「用的 Wiki 頁」都存在
//   2. tools/terms.json 的每個術語，都在某一張的「第一次出現的術語」欄被安排到，而且只安排一次
//   3. 安排到的術語，名詞表裡都有解釋
//   4. 有安排術語的投影片，Wiki 頁要包含「名詞表」（簡報上的解釋才找得到出處）
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) { console.log('用法：node tools/outline_check.mjs <大綱.md>'); process.exit(2); }
const md = readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const { terms } = JSON.parse(readFileSync(join(ROOT, 'tools', 'terms.json'), 'utf8'));
const glossary = readFileSync(join(ROOT, 'wiki', '名詞表.md'), 'utf8');
const split = (s) => s.split(/[、,]/).map((x) => x.trim()).filter(Boolean);

const rows = md.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const errs = [];
const seen = new Map();
for (const [n, title, , pages, newTerms = ''] of rows) {
  const ps = split(pages);
  for (const p of ps) if (!existsSync(join(ROOT, 'wiki', p + '.md'))) errs.push(`第 ${n} 張  Wiki 頁「${p}」不存在`);
  const ts = split(newTerms);
  if (ts.length && !ps.includes('名詞表')) errs.push(`第 ${n} 張  安排了術語（${ts.join('、')}），Wiki 頁卻沒有「名詞表」`);
  for (const t of ts) {
    if (seen.has(t)) errs.push(`第 ${n} 張  術語「${t}」已經在第 ${seen.get(t)} 張安排過`);
    seen.set(t, n);
    const row = glossary.split('\n').find((l) => /^\|/.test(l) && l.split('|')[1].includes(t));
    if (!row) errs.push(`第 ${n} 張  術語「${t}」在名詞表裡沒有解釋（先回 Wiki 補）`);
  }
}
for (const t of terms) if (!seen.has(t)) errs.push(`術語「${t}」沒有安排在任何一張`);

console.log(`大綱 ${rows.length} 張、術語 ${terms.length} 個`);
if (errs.length) { console.log(errs.join('\n')); console.log(`\n✗ ${errs.length} 個問題`); process.exitCode = 1; }
else console.log('✓ 全部通過，可以生成簡報');
