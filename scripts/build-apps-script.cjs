const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
fs.writeFileSync(path.join(root, 'apps-script', 'Index.html'), html);
console.log('已產生 Google 工單頁面。');
