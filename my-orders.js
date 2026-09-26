const LOOKUP_API_URL = 'https://script.google.com/macros/s/AKfycbwtBf4OXPwt_6xOALjjFwJFn1LZaL4nKeL2KSm41omak_E7EGDITyTUzqFPCH2Rk-BU/exec';
const lookupForm = document.querySelector('#lookupForm');
const lookupStatus = document.querySelector('#lookupStatus');
const result = document.querySelector('#result');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normPhone = s => {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('886')) d = '0' + d.slice(3);
  if (/^9\d{8}$/.test(d)) d = '0' + d;
  return d;
};

lookupForm.addEventListener('submit', async event => {
  event.preventDefault();
  const phone = normPhone(lookupForm.phone.value);
  if (!/^09\d{8}$/.test(phone)) {
    lookupStatus.textContent = '請輸入正確的手機號碼（09 開頭共 10 碼）。';
    lookupStatus.className = 'form-status error';
    return;
  }
  const button = lookupForm.querySelector('.submit');
  button.disabled = true;
  lookupStatus.textContent = '查詢中…';
  lookupStatus.className = 'form-status';
  result.hidden = true;
  try {
    const response = await fetch(LOOKUP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'myOrders', phone })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || '查詢失敗');
    lookupStatus.textContent = '';
    render(data);
  } catch (error) {
    lookupStatus.textContent = `查詢失敗：${error.message}，請稍後再試。`;
    lookupStatus.className = 'form-status error';
  } finally {
    button.disabled = false;
  }
});

function render(data) {
  result.hidden = false;
  if (!data.found) {
    result.innerHTML = '<div class="empty">查無此手機號碼的訂單或開票紀錄。<br>若您是透過舊表單訂購、當時未留手機號碼，請聯繫客服協助查詢。</div>';
    return;
  }
  const s = data.summary;
  const orders = data.orders || [];
  const tickets = data.tickets || [];
  const greet = data.name ? `<p class="stat-note">${esc(data.name)} 您好，以下是您的訂單狀態。</p>` : '';
  result.innerHTML = `
    <div class="stats">
      <div class="stat"><span>已預訂張數</span><strong>${s.booked}<small>張</small></strong></div>
      <div class="stat"><span>已開票張數</span><strong>${s.issued}<small>張</small></strong></div>
      <div class="stat accent"><span>尚未開票</span><strong>${s.remaining}<small>張</small></strong></div>
    </div>
    ${greet}
    ${s.pending > 0 ? `<p class="stat-note">其中 ${s.pending} 張款項待客服確認。</p>` : ''}
    <h3 class="section-title">預訂紀錄 <em>${orders.length} 筆</em></h3>
    ${orders.length ? orders.map(o => `
      <div class="item">
        <h4>${esc(o.project || '（未填專案）')}<span class="badge ${o.payment === '已確認款項' ? 'ok' : 'wait'}">${esc(o.payment)}</span></h4>
        <p>${esc(o.time)}${o.cabin ? '・' + esc(o.cabin) : ''}</p>
        <div class="count">${o.tickets}<small>張</small></div>
      </div>`).join('') : '<div class="empty">目前沒有以此手機號碼登記的預訂紀錄。</div>'}
    <h3 class="section-title">開票紀錄 <em>${tickets.length} 筆</em></h3>
    ${tickets.length ? tickets.map(t => `
      <div class="item">
        <h4>${esc(t.route || '（未填航線）')}</h4>
        <p>去程 ${esc(t.departDate || '—')}${t.returnDate ? '・回程 ' + esc(t.returnDate) : ''}${t.cabin ? '・' + esc(t.cabin) : ''}</p>
        <div class="count">${t.passengers}<small>位旅客</small></div>
      </div>`).join('') : '<div class="empty">尚未有開票紀錄。</div>'}
  `;
}
