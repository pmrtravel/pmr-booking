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
    const data = await fetchLookup(phone).catch(() => fetchLookup(phone));
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

async function fetchLookup(phone) {
  const params = new URLSearchParams({ action: 'myOrders', phone, _: Date.now() });
  const url = `${LOOKUP_API_URL}?${params}`;
  const response = await fetch(url, { credentials: 'omit' });
  return response.json();
}

function render(data) {
  result.hidden = false;
  if (!data.found) {
    result.innerHTML = '<div class="empty">查無相符的訂單或開票紀錄。<br>請確認手機號碼與訂購時填寫的相同，或聯繫客服協助查詢。</div>';
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
    ${orders.length ? orders.map((o, i) => `
      <button type="button" class="item" data-kind="order" data-i="${i}">
        <h4>${esc(o.project || '（未填專案）')}<span class="badge ${o.payment === '已確認款項' ? 'ok' : 'wait'}">${esc(o.payment)}</span></h4>
        <p>${esc(o.time)}${o.cabin ? '・' + esc(o.cabin) : ''}</p>
        <div class="count">${o.tickets}<small>張</small></div>
        <span class="more">查看詳細 ›</span>
      </button>`).join('') : '<div class="empty">目前沒有以此手機號碼登記的預訂紀錄。</div>'}
    <h3 class="section-title">開票紀錄 <em>${tickets.length} 筆</em></h3>
    ${tickets.length ? tickets.map((t, i) => `
      <button type="button" class="item" data-kind="ticket" data-i="${i}">
        <h4>${esc(t.route || '（未填航線）')}</h4>
        <p>去程 ${esc(t.departDate || '—')}${t.returnDate ? '・回程 ' + esc(t.returnDate) : ''}${t.cabin ? '・' + esc(t.cabin) : ''}</p>
        <div class="count">${t.passengers}<small>位旅客</small></div>
        <span class="more">查看詳細 ›</span>
      </button>`).join('') : '<div class="empty">尚未有開票紀錄。</div>'}
  `;
  result.querySelectorAll('.item[data-kind]').forEach(el => el.addEventListener('click', () => {
    const i = Number(el.dataset.i);
    openDetail(el.dataset.kind === 'order' ? orderDetail(orders[i]) : ticketDetail(tickets[i]));
  }));
}

const pad = t => String(t || '').replace(/^(\d):/, '0$1:');
const row = (icon, label, value) => `<div class="d-row"><span>${icon} ${label}</span><b>${esc(value || '—')}</b></div>`;

function ticketDetail(t) {
  const d = t.detail || {};
  const pax = (d.list || []).map((p, i) => `
    <div class="d-pax">
      <h5>旅客 ${esc(p.no || i + 1)}</h5>
      ${row('', '姓名', p.name)}
      ${row('', '出生年', p.birthYear ? p.birthYear + ' 年' : '')}
      ${row('', '護照', p.passport)}
      ${row('', '效期', p.expiry)}
    </div>`).join('');
  return `
    <p class="d-eyebrow">✈️ 已開票登記</p>
    <h3>${esc([d.from, d.to].filter(Boolean).join(' → ') || t.route)}</h3>
    <div class="d-sec">
      ${row('📋', '專案', d.project)}
      ${row('🧑‍💼', '負責業務', d.sales)}
      ${row('👤', '訂購人', d.person)}
      ${row('📱', '電話', d.phone)}
      ${row('💬', 'LINE ID', d.lineId)}
      ${row('💬', 'LINE 名稱', d.lineName)}
    </div>
    <div class="d-sec">
      ${row('🛫', '航線', [d.from, d.to].filter(Boolean).join(' → '))}
      ${row('📅', '去程日期', t.departDate)}
      ${row('🕐', '去程時間', pad(d.departTime))}
      ${row('✈️', '去程航班', d.departFlight)}
      ${row('📅', '回程日期', t.returnDate)}
      ${row('🕐', '回程時間', pad(d.returnTime))}
      ${row('✈️', '回程航班', d.returnFlight)}
      ${row('💺', '艙等', t.cabin)}
    </div>
    <div class="d-sec">
      ${row('👥', '旅客數', (d.paxCount || t.passengers) + ' 人')}
      ${pax}
    </div>
    <div class="d-sec d-note"><span>📝 備註</span><p>${esc(d.remark || '無')}</p></div>
    <p class="d-hint">為保護個資，護照號碼僅顯示末 4 碼、生日僅顯示年份。</p>`;
}

function orderDetail(o) {
  const d = o.detail || {};
  const amount = Number(String(d.amount || '').replace(/[^\d.]/g, ''));
  return `
    <p class="d-eyebrow">🧾 預訂紀錄</p>
    <h3>${esc(o.project || '（未填專案）')}</h3>
    <div class="d-sec">
      ${row('🔖', '訂單編號', d.orderId)}
      ${row('📅', '送出時間', o.time)}
      ${row('💳', '匯款狀態', o.payment)}
      ${row('💰', '訂單金額', amount ? 'NT$ ' + amount.toLocaleString('zh-TW') : '')}
    </div>
    <div class="d-sec">
      ${row('🎫', '預定張數', o.tickets + ' 張')}
      ${row('💺', '艙等', o.cabin)}
      ${row('⭐', '星宇加購', d.starlux)}
    </div>
    <div class="d-sec">
      ${row('👤', '訂購人', d.person)}
      ${row('📱', '電話', d.phone)}
      ${row('💬', 'LINE 名稱', d.lineName)}
      ${row('💬', 'LINE ID', d.lineId)}
      ${row('🤝', '介紹人', d.referrer)}
    </div>
    <div class="d-sec d-note"><span>📋 預定專案內容</span><p>${esc(d.projectFull || o.project || '—')}</p></div>
    ${d.remark ? `<div class="d-sec d-note"><span>📝 備註</span><p>${esc(d.remark)}</p></div>` : ''}`;
}

const dialog = document.querySelector('#detailDialog');
function openDetail(html) {
  dialog.querySelector('.d-body').innerHTML = html;
  dialog.showModal();
  dialog.querySelector('.d-body').scrollTop = 0;
}
dialog.querySelector('.d-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
