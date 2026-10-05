// 部署 Apps Script 後，將網址貼到此處。未設定時可預覽版面與驗證流程。
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
const LINE_NOTIFY_API_URL = 'https://script.google.com/macros/s/AKfycbwtBf4OXPwt_6xOALjjFwJFn1LZaL4nKeL2KSm41omak_E7EGDITyTUzqFPCH2Rk-BU/exec';
const form = document.querySelector('#bookingForm');
const status = document.querySelector('#formStatus');
const paymentResult = document.querySelector('#paymentResult');
const hasPMRStore = () => Boolean(window.PMRStore && typeof window.PMRStore.pushOrderToSheet === 'function');
const paymentAccounts = {
  'default': { bank: '807 永豐銀行 營業部分行', account: '20201800325399' }
};

const ticketRows = [['economyCount', '經濟艙'], ['businessCount', '商務艙'], ['firstCount', '頭等艙'], ['starluxUpgrade', '其中幾張加購星宇']];
const ticketMatrix = document.querySelector('#ticketMatrix');
ticketMatrix.innerHTML = `<div class="ticket-selector-grid">${ticketRows.map(([name, label]) => `<label class="ticket-card"><span class="ticket-label">${label}</span><select name="${name}"><option value="0" selected>0 張</option>${Array.from({length: 20}, (_, n) => `<option value="${n + 1}">${n + 1} 張</option>`).join('')}</select></label>`).join('')}</div>`;
['楊翰','阮糖','傑評','史考特','香魚','其他'].forEach((name, index) => document.querySelector('#referrers').insertAdjacentHTML('beforeend', `<label><input type="radio" name="referrer" value="${name}" ${index === 0 ? 'required' : ''}><span>${name}</span></label>`));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const economy = Number(data.economyCount), business = Number(data.businessCount), first = Number(data.firstCount);
  data.orderAmount = Number(data.orderAmount);
  data.ticketCount = economy + business + first;
  data.cabinClass = `經濟艙 ${economy} 張／商務艙 ${business} 張／頭等艙 ${first} 張`;
  data.starluxUpgrade = `${data.starluxUpgrade} 張`;
  if (data.ticketCount === 0) { status.textContent = '請至少選擇一張機票。'; status.className = 'form-status error'; return; }
  const submit = form.querySelector('.submit');
  if (!hasPMRStore() && API_URL.includes('PASTE_YOUR')) { status.textContent = '訂單同步服務尚未載入，請重新整理後再試。'; status.className = 'form-status error'; return; }
  submit.disabled = true; status.textContent = '正在送出您的預約…'; status.className = 'form-status';
  try {
    const pmrOrder = toPMROrder(data);
    data.orderId = pmrOrder.id;
    if (hasPMRStore()) {
      const saved = await window.PMRStore.pushOrderToSheet(pmrOrder);
      if (!saved) throw new Error('PMR 訂單資料庫暫時無法寫入');
    } else {
      const response = await fetch(API_URL, { method: 'POST', headers: {'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(data) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || '送出失敗');
    }
    const notificationSent = await notifyLineGroup(data);
    showPaymentInfo(data, notificationSent);
  } catch (error) { status.textContent = `送出失敗：${error.message}，請稍後再試。`; status.className = 'form-status error'; }
  finally { submit.disabled = false; }
});

function toPMROrder(data) {
  const now = new Date();
  const dateCode = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  return {
    id: `PMR-${dateCode}-${suffix}`, assignedTo: 'J168', customerName: data.contactName,
    title: data.project.split('\n')[0].slice(0, 100), projectOriginal: data.project,
    purchased: Number(data.ticketCount), cabin: data.cabinClass, starlux: data.starluxUpgrade,
    reportedPayment: null, paymentAmount: data.orderAmount, paymentStatus: '待核帳', used: null,
    createdAt: now.toISOString(), lineDisplayName: data.lineName, introducer: data.referrer,
    internalNotes: `${data.remarks || ''}${data.otherReferrer ? `\n其他介紹人：${data.otherReferrer}` : ''}`.trim(),
    phone: data.phone || ''
  };
}

async function notifyLineGroup(data) {
  const notification = { action: 'webBooking', order: {
    orderId: data.orderId || '', phone: data.phone || '',
    contactName: data.contactName, lineId: data.lineId || '',
    project: data.project, ticketCount: data.ticketCount, cabinClass: data.cabinClass,
    starluxUpgrade: data.starluxUpgrade, orderAmount: data.orderAmount, lineName: data.lineName,
    referrer: data.referrer === '其他' ? (data.otherReferrer || '其他') : data.referrer,
    remarks: data.remarks || ''
  }};
  try {
    const response = await fetch(LINE_NOTIFY_API_URL, { method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(notification) });
    const result = await response.json().catch(() => null);
    return Boolean(result && result.ok);
  } catch (_error) { return false; }
}

function showPaymentInfo(data, notificationSent) {
  const details = paymentAccounts[data.referrer] || paymentAccounts.default;
  const referrer = data.referrer === '其他' ? (data.otherReferrer || '其他介紹人') : data.referrer;
  form.hidden = true;
  paymentResult.hidden = false;
  const notifyNote = notificationSent ? '已同步通知客服群組。' : '訂單已記錄，客服將盡快與您聯繫。';
  paymentResult.innerHTML = `<div class="payment-icon">✓</div><h3>訂單已送出</h3><p>${data.contactName}，請依下方資訊完成匯款。<br>本次訂單介紹人：${referrer}</p><div class="bank-card"><p class="label">PAYMENT INFORMATION</p><h4>匯款資訊</h4><div class="bank-row"><span>銀行代碼／分行</span><strong>${details.bank}</strong></div><div class="bank-row"><span>匯款帳號</span><strong>${details.account}</strong></div></div><div class="payment-note">${notifyNote}<br>轉帳完成後，請提供「帳號後五碼」或「明細截圖」，我們會盡快為您確認。<br><b>待客服確認款項後，即完成訂單。</b></div><button class="restart" type="button">填寫另一筆預約</button>`;
  paymentResult.querySelector('.restart').addEventListener('click', () => { form.reset(); form.hidden = false; paymentResult.hidden = true; });
}

// 常見問題搜尋：依關鍵字篩選題目，沒有符合的分類整組隱藏
(function () {
  const input = document.querySelector('#faqSearch');
  if (!input) return;
  const empty = document.querySelector('#faqEmpty');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.faq-group').forEach(group => {
      let any = false;
      group.querySelectorAll('.faq-item').forEach(item => {
        const match = !q || item.textContent.toLowerCase().includes(q);
        item.hidden = !match;
        if (q && match) item.open = true; else if (!q) item.open = false;
        if (match) any = true;
      });
      group.hidden = !any;
      if (any) shown++;
    });
    empty.hidden = shown > 0;
  });
})();
