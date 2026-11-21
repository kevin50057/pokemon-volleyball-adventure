// 型別嚴謹度檢查：src 裡不准出現 any、強制轉型（as unknown as、as never）、關掉型別檢查的註解。
// npm test、npm run build 都會先跑這個；有違規就列出位置並失敗。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const SUPPRESS = /@ts-(ignore|nocheck|expect-error)/;
const RULES = [
  { name: 'any 型別', re: /(:\s*any\b|\bas\s+any\b|<any>|\bany\[\]|Array<any>|,\s*any>)/ },
  { name: '強制轉型 as unknown as', re: /\bas\s+unknown\s+as\b/ },
  { name: '強制轉型 as never', re: /\bas\s+never\b/ },
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** 去掉註解（區塊註解可以跨行） */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((raw) => {
    let line = raw, out = '';
    while (line.length) {
      if (inBlock) {
        const e = line.indexOf('*/');
        if (e < 0) { line = ''; break; }
        line = line.slice(e + 2); inBlock = false;
      } else {
        const b = line.indexOf('/*'), c = line.indexOf('//');
        if (c >= 0 && (b < 0 || c < b)) { out += line.slice(0, c); line = ''; break; }
        if (b < 0) { out += line; line = ''; break; }
        out += line.slice(0, b); line = line.slice(b + 2); inBlock = true;
      }
    }
    return out;
  });
}

const bad = [];
for (const file of walk(ROOT, [])) {
  const raw = readFileSync(file, 'utf8').split(/\r?\n/);
  const code = stripComments(raw);
  const where = (i) => relative(ROOT, file).split('\\').join('/') + ':' + (i + 1);
  raw.forEach((line, i) => {
    if (SUPPRESS.test(line)) bad.push(where(i) + '  關掉型別檢查  ' + line.trim().slice(0, 120));
    for (const r of RULES) if (r.re.test(code[i])) bad.push(where(i) + '  ' + r.name + '  ' + line.trim().slice(0, 120));
  });
}
if (bad.length) {
  console.error('型別嚴謹度檢查沒過（' + bad.length + ' 處）：\n' + bad.join('\n'));
  process.exit(1);
}
console.log('型別嚴謹度檢查通過');
