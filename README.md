# GitHub Pages + Firebase 線上商品資料庫

## 已完成的功能
- Firebase Email/Password 登入與 Firestore 即時雲端資料庫
- 後台新增、編輯、刪除商品
- Excel / CSV 匯入；優先讀取 `Model` 分頁
- 以「商品規格管理編號」作為更新比對鍵
- 商品標題只保留前 15 個字
- 匯入後預設上架；備註可保留原文並後台修改
- Params 參數後台管理、新日誠物流級距管理
- 成本、物流、售價、平台費、利潤、利潤率及建議售價自動計算
- 自動計算欄位可人工覆寫；按「自動」可取消覆寫
- 欄位顯示選擇、搜尋、上下架篩選、分頁、摘要指標
- 讀取頁面檢視、售出單位、訂單計數
- 轉換率採電商標準公式：`訂單計數 ÷ 頁面檢視`

## 一、建立 Firebase
1. 前往 Firebase Console 建立專案。
2. Build → Authentication → Sign-in method，啟用「電子郵件/密碼」。
3. Authentication → Users，新增管理員帳號。
4. Build → Firestore Database，建立資料庫。
5. Firestore → Rules，將本專案 `firestore.rules` 內容貼上並發布。
6. Project settings → Your apps → Web app，複製 Firebase config。
7. 將 `firebase-config.js` 的值替換成自己的 Firebase config。

> 正式上線建議把 Firestore Rules 限制為指定管理員 UID，而非所有登入者。

## 二、部署 GitHub Pages
1. 在 GitHub 建立新的 Public repository。
2. 上傳本資料夾內全部檔案到 repository 根目錄。
3. Repository → Settings → Pages。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`、資料夾選 `/ (root)`，儲存。
6. 等 GitHub 顯示 Pages 網址後開啟。
7. Firebase Console → Authentication → Settings → Authorized domains，加入 GitHub Pages 網域，例如 `帳號.github.io`。

## 三、資料結構
- `products/{id}`：商品資料、計算結果、人工覆寫旗標
- `settings/params`：所有 Params 參數及物流級距
- `imports/{id}`：匯入紀錄

## 四、Excel 匯入欄位
可讀取：
- 商品規格管理編號
- 商品管理編號
- 商品標題
- 規格1、規格2、規格3
- 備註
- 日幣售價(JPY)
- 重量(g)
- 頁面檢視 / 頁面檢視總數
- 售出單位 / 銷售商品數
- 訂單計數 / 銷售訂單數

你的範例 Excel `Model` 目前沒有「規格3」及「銷售訂單數」欄位；系統已預留，日後上傳有同名欄位即可讀取。

## 五、重要說明
- GitHub Pages 只負責前端頁面；所有資料存於 Firebase Firestore。
- Excel 匯入會在瀏覽器端解析，不需另建伺服器。
- 大量資料時，每批最多 400 筆寫入 Firestore，以避開批次上限。
- 目前表格是後台管理型介面。若未來商品超過數萬筆，建議改為 Firestore 分頁查詢及 Algolia/Typesense 搜尋。

## 本版新增功能

- 平台固定為「台灣樂天」與「日安優物 Shopify」；每個商品可分別設定啟用、售價、上下架與備註。
- Excel 匯入時可指定平台；保留商品 Excel 匯入與匯出。
- 新增「系統維護」頁面：顯示商品主檔、銷售、廣告、商品分析、匯入紀錄、平台資料筆數。
- 可勾選指定集合刪除，或清空全部匯入資料；刪除前必須輸入 `DELETE`。
- 清空匯入資料不會刪除 Firebase Authentication 登入帳號，也不會刪除 Firestore 的 `users`、`roles` 集合。
- 新增商品索引重建、Dashboard 重新計算、商品對應健康檢查。
- 健康檢查會顯示 `sales`、`ads`、`productAnalysis` 中未對應商品的筆數。

> 正式環境請將 `firestore.rules` 中的規則改成限制指定管理員 UID。
