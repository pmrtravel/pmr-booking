# PMR 旅遊預約網頁

這個專案包含客戶填寫頁面與寫入 Google 試算表、推播 LINE 群組的 Apps Script 後端。

## 啟用資料寫入與 LINE 通知

1. 建立一份 Google 試算表，複製其網址中的試算表 ID。
2. 到 [Google Apps Script](https://script.google.com/) 建立專案，貼上 `apps-script/Code.gs`。
3. 在 Apps Script 的「專案設定 → 指令碼屬性」新增：
   - `SHEET_ID`：試算表 ID
   - `LINE_CHANNEL_ACCESS_TOKEN`：LINE Messaging API 的 Channel access token
   - `LINE_GROUP_ID`：要接收通知的群組 ID（LINE Bot 必須先加入該群組）
4. 「部署 → 新增部署作業 → 網頁應用程式」；執行身分選自己，存取權限選任何人，複製 `/exec` 網址。
5. 將網址填入 `app.js` 最上方的 `API_URL`，再把網站部署至 GitHub Pages 或您的主機。

> 訂購人個資會寫入試算表。請限制試算表的共用權限，且勿將 LINE token 放入前端程式碼。
