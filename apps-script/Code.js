const HEADERS_ = ['紀錄 ID', '儲存時間', '客戶名稱', '電話', '地址', '報價日期', '工單編號', '合計', '完整工單資料'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('東美園藝・報價與工單')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
}

function validateQuote_(input) {
  if (!input || typeof input !== 'object' || !input.info || !Array.isArray(input.items) || typeof input.taxOn !== 'boolean') {
    throw new Error('工單資料不完整，請重新整理後再試。');
  }
  const data = { info: {}, items: [], notes: '', taxOn: input.taxOn === true };
  const fields = ['clientName', 'phone', 'address', 'quoteDate', 'validity', 'quoteNo'];
  fields.forEach(function(key) {
    if (typeof input.info[key] !== 'string' || input.info[key].length > 2000) {
      throw new Error('客戶資料格式不正確或內容過長。');
    }
    data.info[key] = input.info[key].trim();
  });
  if (!data.info.clientName || data.info.clientName.length > 200) {
    throw new Error('請填寫客戶名稱，最多 200 個字。');
  }
  if (input.items.length > 200) throw new Error('每張工單最多 200 個工程項目。');
  input.items.forEach(function(item, index) {
    if (!item || typeof item.desc !== 'string' || item.desc.length > 2000) {
      throw new Error('第 ' + (index + 1) + ' 項工程說明格式不正確或過長。');
    }
    const desc = item.desc.trim();
    const qty = number_(item.qty);
    const price = number_(item.price);
    if (!desc && qty === 0 && price === 0) return;
    if (!desc) throw new Error('請填寫第 ' + (index + 1) + ' 項工程說明。');
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000000) {
      throw new Error('第 ' + (index + 1) + ' 項數量必須大於零。');
    }
    if (!Number.isFinite(price) || price < 0 || price > 1000000000) {
      throw new Error('第 ' + (index + 1) + ' 項單價必須為零或正數。');
    }
    data.items.push({ desc: desc, qty: qty, price: price });
  });
  if (!data.items.length) throw new Error('請至少填寫一個工程項目。');
  if (typeof input.notes !== 'string' || input.notes.length > 10000) {
    throw new Error('備註最多 10,000 個字。');
  }
  data.notes = input.notes;
  if (JSON.stringify(data).length > 45000) throw new Error('這張工單內容太長，請分成兩張儲存。');
  if (!Number.isSafeInteger(total_(data))) throw new Error('工單金額超出可儲存範圍。');
  return data;
}

function number_(value) {
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
}

function total_(data) {
  const subtotal = data.items.reduce(function(sum, item) { return sum + item.qty * item.price; }, 0);
  return Math.round(subtotal * (data.taxOn ? 1.05 : 1));
}

function sheetText_(value) {
  // 以純文字寫入，保留電話開頭的零，也避免輸入內容被當成試算表公式。
  return value ? "'" + value : '';
}

function withStore_(operation) {
  // ponytail: 工單量小，使用同一把鎖避免同時新增重複；大量多人操作時再換資料庫。
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('目前有另一筆工單正在儲存，請稍後重試。');
  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty('TOMEI_SPREADSHEET_ID');
    const spreadsheet = spreadsheetId
      ? SpreadsheetApp.openById(spreadsheetId)
      : SpreadsheetApp.create('東美園藝工單紀錄');
    let sheet = spreadsheet.getSheetByName('工單紀錄');
    if (!spreadsheetId) {
      spreadsheet.setSpreadsheetTimeZone('Asia/Taipei');
      sheet = spreadsheet.getSheets()[0];
      sheet.setName('工單紀錄');
      sheet.getRange(1, 1, 1, HEADERS_.length).setValues([HEADERS_])
        .setBackground('#1B5E20').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(2, 170);
      sheet.setColumnWidth(3, 200);
      sheet.setColumnWidth(5, 250);
      sheet.setColumnWidth(7, 230);
      sheet.hideColumns(9);
      properties.setProperty('TOMEI_SPREADSHEET_ID', spreadsheet.getId());
    }
    if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, HEADERS_.length).getValues()[0]) !== JSON.stringify(HEADERS_)) {
      throw new Error('雲端工單表的欄位已變更，請先還原欄位名稱；本次未寫入資料。');
    }
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_.length).getValues() : [];
    return operation(sheet, rows, spreadsheet);
  } finally {
    lock.releaseLock();
  }
}

function decodeRecord_(row) {
  const data = validateQuote_(JSON.parse(row[8]));
  return { id: String(row[0]), createdAt: new Date(row[1]).toISOString(), data: data, total: total_(data) };
}

function saveQuote(request) {
  if (!request || typeof request.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.id)) {
    throw new Error('工單識別碼不正確，請重新整理後再試。');
  }
  const data = validateQuote_(request.data);
  return withStore_(function(sheet, rows) {
    const existing = rows.find(function(row) { return String(row[0]) === request.id; });
    if (existing) {
      const record = decodeRecord_(existing);
      if (!data.info.quoteNo) data.info.quoteNo = record.data.info.quoteNo;
      if (JSON.stringify(record.data) !== JSON.stringify(data)) throw new Error('同一筆儲存要求的內容已變更，請重新整理後再試。');
      return record;
    }
    const now = new Date();
    if (!data.info.quoteNo) {
      data.info.quoteNo = 'TM-' + Utilities.formatDate(now, 'Asia/Taipei', 'yyyyMMdd') + '-' + request.id.slice(0, 8).toUpperCase();
    }
    const record = { id: request.id, createdAt: now.toISOString(), data: data, total: total_(data) };
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, HEADERS_.length).setValues([[
      sheetText_(record.id), now, sheetText_(data.info.clientName), sheetText_(data.info.phone),
      sheetText_(data.info.address), sheetText_(data.info.quoteDate), sheetText_(data.info.quoteNo),
      record.total, JSON.stringify(data)
    ]]);
    sheet.getRange(nextRow, 2).setNumberFormat('yyyy/mm/dd hh:mm');
    sheet.getRange(nextRow, 8).setNumberFormat('"$"#,##0');
    SpreadsheetApp.flush();
    return record;
  });
}

function searchQuotes(search, beforeRow) {
  if (typeof search !== 'string' || search.length > 200) throw new Error('搜尋內容最多 200 個字。');
  if (!Number.isInteger(beforeRow) || beforeRow < 0) throw new Error('查詢頁碼不正確，請重新搜尋。');
  const query = search.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();
  return withStore_(function(sheet, rows, spreadsheet) {
    const results = [];
    let nextCursor = 0;
    const start = beforeRow ? Math.min(rows.length - 1, beforeRow - 3) : rows.length - 1;
    for (let index = start; index >= 0; index--) {
      const record = decodeRecord_(rows[index]);
      const info = record.data.info;
      const searchable = [info.clientName, info.phone, info.address, info.quoteNo]
        .join(' ').normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();
      if (query && !searchable.includes(query)) continue;
      if (results.length === 25) return { records: results, nextCursor: nextCursor, spreadsheetUrl: spreadsheet.getUrl() };
      results.push(record);
      nextCursor = index + 2;
    }
    return { records: results, nextCursor: 0, spreadsheetUrl: spreadsheet.getUrl() };
  });
}
