# 東美園藝報價與工單

使用入口：https://cityfish91159.github.io/tomei/

入口會開啟 Google 雲端工單。使用部署者的 Google 帳號登入，第一次使用依 Google 畫面授權試算表存取。

- 填寫客戶名稱、工程項目，按「儲存紀錄」。未填工單編號時會自動產生。
- 按「查詢紀錄」，可搜尋客戶名稱、電話、地址或工單編號；清除搜尋文字可看全部。
- 舊工單可載入查看、重新產生 PDF；修改後儲存會新增歷史紀錄，原紀錄保留。
- 每筆紀錄包含整張報價單。重複點擊或同一要求重試不會重複新增。
- 「清空重填」只清空目前畫面。工單需按儲存才會寫入 Google，沒有本機自動暫存。

首次儲存或查詢時，程式會在部署者的 Google 雲端硬碟建立「東美園藝工單紀錄」試算表。查詢視窗下方可開啟該表。請保留首列欄位與隱藏的完整工單資料欄，供程式還原歷史工單。

## 維護

本網站獨立於其他專案，沒有套件執行依賴。`index.html` 是報價頁，`apps-script/Code.js` 提供 Google 試算表儲存及查詢。

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

接著以 `clasp update-deployment <部署 ID> -V <剛建立的版本號>` 更新同一個部署，再推送 GitHub `main`。保留 `appsscript.json` 的 `MYSELF` 存取設定，客戶紀錄限定部署者帳號使用。

本機測試使用 Google 服務模擬，涵蓋驗證、金額、重試去重、搜尋、分頁、錯誤與私人存取設定；正式 Google 授權與儲存仍需在部署頁確認。
