// AI 辨識金額：解析貼上的專案文字（規則式），支援群組內常見的販售寫法。
(function (root) {
  const CABINS = [['經濟艙', '經濟'], ['商務艙', '商務'], ['頭等艙', '頭等']];
  const NUM = '[1-9]\\d{3,5}';
  const CN = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const norm = t => String(t || '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))
    .replace(/(\d)[,，](?=\d{3})/g, '$1').replace(/＄/g, '$').replace(/[​ ]/g, ' ');
  const cabinIn = s => { for (const [name, short] of CABINS) if (s.includes(short)) return name; return null; };
  const firstPrice = s => { const m = s.match(new RegExp(`(?<![\\d/])(${NUM})(?!\\d|/\\d{1,2}/\\d|[A-Za-z年月日晚])`)); return m ? Number(m[1]) : null; };
  // 「2晚」「兩晚」「三天兩夜」→ 晚數；一行裡出現兩種以上晚數（如「兩晚/三晚任選」）視為沒有指定
  function nightsOf(line) {
    const found = [...line.matchAll(/([0-9]{1,2}|[一二兩三四五六七八九十])\s*(?:晚|夜)/g)].map(m => CN[m[1]] || Number(m[1]));
    const u = [...new Set(found)];
    return u.length === 1 ? u[0] : null;
  }

  function groupOf(line) {
    let m;
    if ((m = line.match(/(?:一組|每組|1組)\s*(\d+)\s*[位人張]/))) return Number(m[1]);
    if ((m = line.match(/(\d+)\s*[位人張]\s*(?:一組|為一組)/))) return Number(m[1]);
    if ((m = line.match(/(?:雙人組|三人組|四人組|五人組)\s*[（(]\s*(\d+)\s*張/))) return Number(m[1]);
    if (/雙人組/.test(line)) return 2;
    if (/四人組/.test(line)) return 4;
    if ((m = line.match(/(?<![\d,])(\d+)\s*位/))) return Number(m[1]);
    if ((m = line.match(/(\d+)\s*張\s*\$?\d/))) return Number(m[1]);
    return 1;
  }

  // 回傳 [{cabin, price, group, kind: 'total'|'inc', nights}]
  function parseOffers(raw) {
    const offers = [];
    norm(raw).split('\n').forEach(orig => {
      if (!orig.trim() || /專案代號|開票|效期|原價|限購|提交時間|=/.test(orig)) return;
      if (/房|飯店|住宿/.test(orig) && /[／/]間/.test(orig)) return;
      const group = groupOf(orig);
      const nights = nightsOf(orig);
      const line = orig.replace(/[（(][^）)]*[）)]/g, ' ');
      let kind = /[+＋]\s*\$?\d|加價\s*\$?\d|加購[^\d\n]{0,8}\$?\d/.test(line) ? 'inc' : 'total';
      // 「單人升級商務艙1張:22000」「每位升級…」是單張升級的加價，不是整組價
      if (group === 1 && /升級|升等/.test(line) && /單人|每人|每位|每張|1\s*張|一張/.test(line)) kind = 'inc';
      const pairs = [...line.matchAll(new RegExp(`(經濟艙|經濟|商務艙|商務|頭等艙|頭等)[^\\d\\n]{0,14}\\$?\\s*(${NUM})(?!\\d|/\\d{1,2}/\\d)`, 'g'))];
      if (pairs.length) {
        pairs.forEach(p => offers.push({ cabin: cabinIn(p[1]), price: Number(p[2]), group: pairs.length > 1 ? 1 : group, kind, nights }));
        return;
      }
      const price = firstPrice(line);
      if (price === null) return;
      let cabin = cabinIn(line);
      if (!cabin && /升級|升等/.test(line)) cabin = '商務艙';
      if (!cabin && /優惠售價|一組|單張|單人|雙人組|四人組|\d+\s*張\s*\$?\d/.test(line)) cabin = '經濟艙';
      if (cabin) offers.push({ cabin, price, group, kind, nights });
    });
    return offers;
  }

  // 專案有標晚數時，只留下所選晚數（沒標晚數的價格通用）
  function byNights(list, nights, what) {
    const tagged = uniq(list.filter(o => o.nights).map(o => o.nights));
    if (!tagged.length) return { list };
    if (!nights) return { err: 'nights', msg: `專案有 ${tagged.join('／')} 晚不同價格，請先選擇住宿晚數` };
    const keep = list.filter(o => !o.nights || o.nights === nights);
    if (!keep.some(o => o.nights === nights)) return { err: 'nights', msg: `專案中找不到 ${nights} 晚的${what || ''}價格（有 ${tagged.join('／')} 晚）` };
    return { list: keep };
  }

  const uniq = a => [...new Set(a)];
  const pickTotal = (list, q) => {
    const fit = list.filter(o => q % o.group === 0);
    if (!fit.length) return null;
    const g = Math.max(...fit.map(o => o.group));
    const top = fit.filter(o => o.group === g);
    return { g, prices: uniq(top.map(o => o.price)) };
  };
  const fmt = n => n.toLocaleString('en-US');

  // 計算某艙等 q 張的價格。回傳 {items} 或 {err, msg}
  function priceCabin(offers, cabin, q, unit = '張') {
    const totals = offers.filter(o => o.cabin === cabin && o.kind === 'total');
    if (totals.length) {
      const hit = pickTotal(totals, q);
      if (!hit) { const g = Math.min(...totals.map(o => o.group)); return { err: 'group', msg: `${cabin}須 ${g} ${unit}為一組才能購買，目前選了 ${q} ${unit}` }; }
      if (hit.prices.length > 1) return { err: 'ambiguous', msg: `專案中的「${cabin}」有多個價格（${hit.prices.map(fmt).join('、')}）` };
      const groups = q / hit.g;
      return { items: [{ label: cabin, price: hit.prices[0], qty: groups, unit: hit.g > 1 ? '組' : unit, note: hit.g > 1 ? `${q} ${unit}` : '' }] };
    }
    const incs = offers.filter(o => o.cabin === cabin && o.kind === 'inc');
    const base = pickTotal(offers.filter(o => o.cabin === '經濟艙' && o.kind === 'total'), q);
    if (incs.length && base && base.prices.length === 1 && cabin !== '經濟艙') {
      const incPrices = uniq(incs.map(o => o.price));
      if (incPrices.length > 1) return { err: 'ambiguous', msg: `專案中的「${cabin}」加價有多個金額（${incPrices.map(fmt).join('、')}）` };
      return { items: [
        { label: '經濟艙底價', price: base.prices[0], qty: q / base.g, unit: base.g > 1 ? '組' : unit, note: base.g > 1 ? `${q} ${unit}` : '' },
        { label: `升級${cabin}加價`, price: incPrices[0], qty: q, unit }
      ] };
    }
    return { err: 'missing', msg: `在專案文字中找不到「${cabin}」的價格` };
  }

  // 機票（含機加酒）：counts = {經濟艙, 商務艙, 頭等艙}；nights = 住宿晚數（沒有就 0）
  // 先各艙等分開算；算不出來時，試「整組以經濟艙計價＋部分人單張升級」
  function priceTickets(raw, counts, nights) {
    const n = byNights(parseOffers(raw), nights);
    if (n.err) return { items: [], problems: [n.msg] };
    const offers = n.list;
    const items = [], problems = [];
    Object.keys(counts).forEach(cabin => {
      const q = counts[cabin]; if (!q) return;
      const r = priceCabin(offers, cabin, q);
      if (r.items) items.push(...r.items); else problems.push(r.msg);
    });
    if (!problems.length) return { items, problems };
    const seats = Object.values(counts).reduce((a, b) => a + b, 0);
    const base = pickTotal(offers.filter(o => o.cabin === '經濟艙' && o.kind === 'total'), seats);
    if (base && base.prices.length === 1) {
      const mixed = [{ label: '經濟艙', price: base.prices[0], qty: seats / base.g, unit: base.g > 1 ? '組' : '張', note: base.g > 1 ? `${seats} 張` : '' }];
      let ok = true;
      ['商務艙', '頭等艙'].forEach(cabin => {
        const q = counts[cabin]; if (!q || !ok) return;
        const inc = uniq(offers.filter(o => o.cabin === cabin && o.kind === 'inc').map(o => o.price));
        if (inc.length !== 1) { ok = false; return; }
        mixed.push({ label: `升級${cabin}`, price: inc[0], qty: q, unit: '張', note: '' });
      });
      if (ok) return { items: mixed, problems: [] };
    }
    return { items: [], problems };
  }

  // 房型價格。nights 有選時：標「每晚／一晚」的價格會乘上晚數；標「N晚」的只取所選晚數
  function priceRoom(raw, label, q, nights) {
    const found = [];
    norm(raw).split('\n').forEach(line => {
      if (/加價|升級|可加|升等/.test(line)) return;
      const i = line.indexOf(label); if (i < 0) return;
      const m = line.slice(i + label.length).match(/[^\d\n]{0,24}?\$?\s*([1-9]\d{2,5})(?!\d|\/\d{1,2}\/\d|\s*晚)/);
      if (m && (label === '加床' || Number(m[1]) >= 1000)) found.push({ price: Number(m[1]), perNight: /每晚|[／/]\s*晚|一晚\s*\$?\d|晚\s*[／/]/.test(line), nights: nightsOf(line) });
    });
    const unit = '間';
    if (!found.length) return { err: 'missing', msg: `在專案文字中找不到「${label}」的價格` };
    const n = byNights(found, nights, label);
    if (n.err) return n;
    const prices = uniq(n.list.map(o => o.price));
    if (prices.length > 1) return { err: 'ambiguous', msg: `專案中的「${label}」有多個價格（${prices.map(fmt).join('、')}）` };
    const perNight = n.list.some(o => o.perNight && o.price === prices[0]);
    if (perNight && !nights) return { err: 'nights', msg: `「${label}」是每晚計價，請先選擇住宿晚數` };
    return { items: [{ label, price: prices[0], qty: perNight ? q * nights : q, unit: perNight ? '間晚' : unit, note: perNight ? `${q} 間 × ${nights} 晚` : '' }] };
  }

  // 專案文字裡提到的晚數（用來自動帶入）
  function nightsIn(raw) {
    return uniq(norm(raw).split('\n').map(nightsOf).filter(Boolean)).sort((a, b) => a - b);
  }

  function starluxPrice(raw) {
    const m = norm(raw).match(/星宇[^\d\n]{0,10}[+＋]?\s*\$?\s*(\d{3,5})/);
    return m ? Number(m[1]) : 2000;
  }

  const api = { parseOffers, priceCabin, priceTickets, priceRoom, nightsIn, starluxPrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PMRPricing = api;
})(typeof window !== 'undefined' ? window : globalThis);
