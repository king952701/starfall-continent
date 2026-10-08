/* 把 ../starfall（网页版）同步进 www/，并注入移动端启动/返回键逻辑
 * 用法： node scripts/prepare.js            */
const fs = require('fs'), path = require('path');

const SRC = path.resolve(__dirname, '..', '..', 'starfall');
const WWW = path.resolve(__dirname, '..', 'www');
const SKIP = ['_t', '.tmp', '.bak'];

function rmrf(d) { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); }
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (SKIP.some(s => f.startsWith(s))) continue;
    const a = path.join(from, f), b = path.join(to, f);
    const st = fs.statSync(a);
    if (st.isDirectory()) copy(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(SRC)) { console.error('找不到网页版源码：' + SRC); process.exit(1); }
rmrf(WWW);
copy(SRC, WWW);

/* 注入移动端：返回键先关面板，再双击退出 */
const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
if (html.indexOf('cordova.js') < 0) {
  html = html.replace('</body>', `
<script src="cordova.js"></script>
<script src="mobile-boot.js"></script>
</body>`);
  fs.writeFileSync(idx, html, 'utf8');
}

fs.copyFileSync(path.join(__dirname, 'mobile-boot.js'), path.join(WWW, 'mobile-boot.js'));

const count = fs.readdirSync(WWW).length;
console.log('已同步网页版 → www/（' + count + ' 个顶层文件/目录）');
