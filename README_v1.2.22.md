# Product Database V1.2.22

## 修正：參數設定消失、營運總覽 / 平台比較空白

V1.2.20~V1.2.21 新增 `ordersHistory` 與 `trafficHistory` 後，
`loadAll()` 會對這兩個變數賦值，但主程式沒有正式宣告它們。

因為 app.js 是 ES Module，未宣告變數賦值會直接產生 ReferenceError，
導致 loadAll() 在 renderParams()、renderOverview() 前就停止，所以：
- 計算參數欄位空白
- 新日誠物流級距空白
- 營運總覽資料為 0 / 圖表空白
- 平台比較只剩框架或完全空白

V1.2.22：
- 正式宣告 ordersHistory / trafficHistory
- renderParams() 增加 DEFAULT_PARAMS fallback
- tiers 不存在或損壞時自動恢復預設物流級距
- 開啟參數設定時重新 renderParams()
- 增加全域 JS error / unhandled rejection console 診斷
