# 東美園藝報價與工單

使用入口：https://cityfish91159.github.io/tomei/

東美人員直接在原網址新增、查詢工單與產生報價單，不需要密碼或 Google 登入。依委託者確認的需求，任何取得連結的人均可新增及查詢全部工單；網址本身不是存取驗證。網站不會轉接 Google 授權頁。

- 填寫客戶名稱、工程項目，按「儲存紀錄」。未填工單編號時會自動產生。
- 按「查詢紀錄」，可搜尋客戶名稱、電話、地址或工單編號；清除搜尋文字可看全部。
- 舊工單可載入查看、重新產生 PDF；修改後儲存會新增歷史紀錄，原紀錄保留。
- 每筆紀錄包含整張報價單。重複點擊或同一要求重試不會重複新增。
- 「清空重填」只清空目前畫面。工單需按儲存才會寫入 Google，沒有本機自動暫存。

首次儲存或查詢時，程式會在部署者的 Google 雲端硬碟建立「東美園藝工單紀錄」試算表。試算表本身保留私人權限，人員透過網站的限定工單操作讀寫。管理者需在建置時完成 Google 授權；使用人員不需操作 Google。請保留首列欄位與隱藏的完整工單資料欄，供程式還原歷史工單。

## 維護

本網站獨立於其他專案，沒有套件執行依賴。`index.html` 是 GitHub Pages 報價頁，直接以不帶 Cookie 的 `POST` 呼叫 `apps-script/Code.js`。後台只接受 `saveQuote` 與 `searchQuotes`，透過 Google 試算表儲存及查詢。

Apps Script 編輯器：https://script.google.com/d/19LE_9PnFFlIWeLXA2lLC3WP6IvhA_N7j53Gk-09rBEJZSuG1iRsgAJi9/edit

部署 ID：`AKfycbzv9SiQ3_Sif7vfW7QpeucGv7bNTNAKfnci04la-v6imeDkn8jJe5-tllkcKYtaJ5dL`

`.clasp.json` 與登入憑證不進版本控制。新的維護環境登入官方 `@google/clasp` 後，建立 `.clasp.json`：

```json
{
  "scriptId": "19LE_9PnFFlIWeLXA2lLC3WP6IvhA_N7j53Gk-09rBEJZSuG1iRsgAJi9",
  "rootDir": "apps-script"
}
```

驗證並產生要上傳的 HTML：

```powershell
node.exe scripts/test-cloud.cjs
node.exe scripts/build-apps-script.cjs
npm exec --yes --package=@google/clasp -- clasp push
npm exec --yes --package=@google/clasp -- clasp create-version '更新東美園藝工單'
```

接著以 `clasp update-deployment <部署 ID> -V <剛建立的版本號>` 更新同一個部署，再推送 GitHub `main`。`appsscript.json` 使用 `ANYONE_ANONYMOUS` 與 `USER_DEPLOYING`，讓人員免 Google 登入，由管理者的帳號執行後台。變更存取政策前須重新確認業務需求。

本機測試使用 Google 服務模擬，涵蓋驗證、金額、重試去重、搜尋、分頁、錯誤、免登入設定、API 及前端請求。部署驗收需以未登入 Google 的連線檢查正式 API 和跨來源回應。
