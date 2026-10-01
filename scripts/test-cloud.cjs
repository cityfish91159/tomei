const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const rows = [];
const writes = [];
const properties = new Map();
let locks = 0;
let releases = 0;
let created = 0;
let locked = false;
let failWrite = false;
const sheet = {
  getRange(row, col, height = 1, width = 1) {
    const range = {
      getValues: () => Array.from({ length: height }, (_, r) =>
        Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[col - 1 + c] ?? '')),
      setValues(values) {
        if (failWrite) throw new Error('模擬 Google 寫入失敗');
        writes.push(values);
        values.forEach((line, r) => line.forEach((value, c) => {
          rows[row - 1 + r] ||= [];
          // Google 試算表的純文字前綴不屬於儲存格讀取值。
          rows[row - 1 + r][col - 1 + c] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value;
        }));
        return range;
      }
    };
    for (const method of ['setBackground', 'setFontColor', 'setFontWeight', 'setNumberFormat']) range[method] = () => range;
    return range;
  },
  getLastRow: () => rows.length,
  setName() {}, setFrozenRows() {}, setColumnWidth() {}, hideColumns() {}
};
const spreadsheet = {
  getSheetByName: () => sheet,
  getSheets: () => [sheet],
  setSpreadsheetTimeZone() {},
  getId: () => '測試用試算表',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/test'
};
const server = vm.createContext({
  LockService: { getScriptLock: () => ({ tryLock: () => { locks++; return !locked; }, releaseLock: () => { releases++; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
  SpreadsheetApp: { create: () => { created++; return spreadsheet; }, openById: () => spreadsheet, flush() {} },
  Utilities: { formatDate: () => '20261001' }
});
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.js'), 'utf8'), server);
const quote = () => ({
  info: { clientName: '測試社區', phone: '0912345678', address: '台北市測試路', quoteDate: '115.10.01', validity: '一個月', quoteNo: '' },
  items: [{ desc: '樹木修剪', qty: '2', price: '123.5' }], notes: '測試備註', taxOn: true
});

for (const change of [
  data => { data.info.clientName = ' '; },
  data => { data.items[0].qty = '-1'; },
  data => { data.items[0].price = 'Infinity'; },
  data => { data.items[0].qty = '1x'; },
  data => { data.items = []; },
  data => { data.taxOn = 'false'; },
  data => { data.notes = '字'.repeat(10001); }
]) {
  const data = quote(); change(data);
  assert.throws(() => server.saveQuote({ id: randomUUID(), data }));
}
assert.equal(created, 0, '無效工單不建立試算表');
const request = { id: randomUUID(), data: quote() };
request.data.info.clientName = '=HYPERLINK("https://example.com")';
const first = server.saveQuote(request);
assert.equal(first.total, 259, '雲端合計包含 5% 營業稅並四捨五入');
assert.match(first.data.info.quoteNo, /^TM-20261001-/);
assert.equal(rows[1][3], '0912345678', '保留電話開頭的零');
assert.equal(writes[1][0][2], "'" + request.data.info.clientName, '名稱以純文字寫入，避免公式執行');
assert.equal(server.saveQuote(request).id, first.id);
assert.equal(rows.length, 2, '相同要求重試不新增紀錄');
const changed = structuredClone(request);
changed.data.items[0].price = '500';
assert.throws(() => server.saveQuote(changed), /內容已變更/);
assert.equal(rows.length, 2);

const ids = [];
for (let index = 0; index < 53; index++) {
  const data = quote();
  data.info.clientName = '測試社區 Ａ';
  data.info.address = '測試路 ' + index;
  data.info.phone = index === 9 ? '0988000000' : '0912345678';
  data.taxOn = false;
  ids.push(server.saveQuote({ id: randomUUID(), data }).id);
}
assert.equal(created, 1, '所有工單共用同一份試算表');
const found = [];
let cursor = 0;
do {
  const page = server.searchQuotes(' 測試社區 a ', cursor);
  assert.ok(page.records.length <= 25);
  found.push(...page.records.map(record => record.id));
  cursor = page.nextCursor;
} while (cursor);
assert.deepEqual(found, ids.reverse(), '名稱搜尋忽略空白及全半形，分頁沒有遺漏或重複');
assert.equal(server.searchQuotes('0988000000', 0).records.length, 1, '同名客戶可用電話區分');
assert.equal(server.searchQuotes('完全不存在', 0).records.length, 0);
assert.equal(server.searchQuotes(first.data.info.quoteNo, 0).records[0].id, first.id);
assert.throws(() => server.searchQuotes('', -1), /頁碼/);

const beforeFailure = rows.length;
failWrite = true;
assert.throws(() => server.saveQuote({ id: randomUUID(), data: quote() }), /寫入失敗/);
failWrite = false;
assert.equal(rows.length, beforeFailure);
rows[0][0] = '被修改的欄位';
assert.throws(() => server.saveQuote({ id: randomUUID(), data: quote() }), /欄位已變更/);
assert.equal(rows.length, beforeFailure, '欄位損壞時不寫入');
assert.equal(locks, releases, '成功與失敗皆釋放鎖');
locked = true;
assert.throws(() => server.searchQuotes('', 0), /稍後重試/);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (const code of scripts) new vm.Script(code);
assert.ok(!/localStorage\s*\./.test(html), '工單資料不使用本機儲存');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps-script/appsscript.json'), 'utf8'));
assert.equal(manifest.webapp.access, 'MYSELF', '工單限定擁有者存取');
assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');

async function checkClient() {
  const elements = new Map();
  const client = vm.createContext({
    crypto: { randomUUID }, setTimeout, clearTimeout,
    document: {
      readyState: 'loading', addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false, focus() {} });
        return elements.get(id);
      }
    }
  });
  vm.runInContext(scripts.find(code => code.includes('function saveCloudQuote()')), client);
  let form = quote();
  let message = '';
  let calls = 0;
  let resolveSave;
  client.collectFormData = () => structuredClone(form);
  client.applyDraft = draft => { form = structuredClone(draft.data); };
  client.markPDFStale = () => {};
  client.cloudNotice = text => { message = text; };
  client.callCloud = () => { calls++; return new Promise(resolve => { resolveSave = resolve; }); };
  const pending = client.saveCloudQuote();
  await client.saveCloudQuote();
  assert.equal(calls, 1, '儲存中連按不會再次送出');
  form.notes = '送出後繼續修改';
  resolveSave(first);
  await pending;
  assert.equal(form.notes, '送出後繼續修改', '較晚回應不能覆蓋使用者的新修改');
  assert.match(message, /新修改尚未儲存/);
  assert.equal(elements.get('saveIndicator').textContent, '尚未儲存');

  const requests = [];
  client.callCloud = async (name, args) => {
    requests.push(args[0]);
    if (requests.length === 1) throw new Error('模擬網路中斷');
    return { data: structuredClone(form) };
  };
  await client.saveCloudQuote();
  assert.equal(form.notes, '送出後繼續修改', '連線失敗仍保留畫面內容');
  assert.equal(elements.get('cloudSaveBtn').disabled, false);
  await client.saveCloudQuote();
  assert.equal(requests[0].id, requests[1].id, '失敗後以同一識別碼重試');
  assert.equal(elements.get('saveIndicator').textContent, '已存入雲端');
  await client.saveCloudQuote();
  assert.equal(requests.length, 2, '已儲存且未修改的內容不新增紀錄');
}

checkClient().then(() => {
  console.log('通過：資料驗證、金額、文字安全、重試去重、客戶查詢、分頁、錯誤保護、前端儲存競態、程式語法與私人存取設定。');
}).catch(error => { console.error(error); process.exitCode = 1; });
