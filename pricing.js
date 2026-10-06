// AI 辨識金額：解析貼上的專案文字（規則式），支援群組內常見的販售寫法。
(function (root) {
  const CABINS = [['經濟艙', '經濟'], ['商務艙', '商務'], ['頭等艙', '頭等']];
  const NUM = '[1-9]\\d{3,5}';
  const norm = t => String(t || '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))
    .replace(/(\d)[,，](?=\d{3})/g, '$1').replace(/＄/g, '$').replace(/[​ ]/g, ' ');
  const cabinIn = s => { for (const [name, short] of CABINS) if (s.includes(short)) return name; return null; };
  const firstPrice = s => { const m = s.match(new RegExp(`(?<![\\d/])(${NUM})(?!\\d|/\\d{1,2}/\\d|[A-Za-z年月日])`)); return m ? Number(m[1]) : null; };

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

  // 回傳 [{cabin, price, group, kind: 'total'|'inc'}]
  function parseOffers(raw) {
    const offers = [];
    norm(raw).split('\n').forEach(orig => {
      if (!orig.trim() || /專案代號|開票|效期|原價|限購|提交時間|=/.test(orig)) return;
      if (/房|飯店|住宿/.test(orig) && /[／/]間/.test(orig)) return;
      const group = groupOf(orig);
      const line = orig.replace(/[（(][^）)]*[）)]/g, ' ');
      const kind = /[+＋]\s*\$?\d|加價\s*\$?\d|加購[^\d\n]{0,8}\$?\d/.test(line) ? 'inc' : 'total';
      const pairs = [...line.matchAll(new RegExp(`(經濟艙|經濟|商務艙|商務|頭等艙|頭等)[^\\d\\n]{0,14}\\$?\\s*(${NUM})(?!\\d|/\\d{1,2}/\\d)`, 'g'))];
      if (pairs.length) {
        pairs.forEach(p => offers.push({ cabin: cabinIn(p[1]), price: Number(p[2]), group: pairs.length > 1 ? 1 : group, kind }));
        return;
      }
      const price = firstPrice(line);
      if (price === null) return;
      let cabin = cabinIn(line);
      if (!cabin && /升級|升等/.test(line)) cabin = '商務艙';
      if (!cabin && /優惠售價|一組|單張|單人|雙人組|四人組|\d+\s*張\s*\$?\d/.test(line)) cabin = '經濟艙';
      if (cabin) offers.push({ cabin, price, group, kind });
    });
    return offers;
  }

  const uniq = a => [...new Set(a)];
  // 計算某艙等 q 張的價格。回傳 {items} 或 {err, msg}
  function priceCabin(offers, cabin, q, unit = '張') {
    const pickTotal = list => {
      const fit = list.filter(o => q % o.group === 0);
      if (!fit.length) return null;
      const g = Math.max(...fit.map(o => o.group));
      const top = fit.filter(o => o.group === g);
      return { g, prices: uniq(top.map(o => o.price)) };
    };
    const totals = offers.filter(o => o.cabin === cabin && o.kind === 'total');
    if (totals.length) {
      const hit = pickTotal(totals);
      if (!hit) { const g = Math.min(...totals.map(o => o.group)); return { err: 'group', msg: `${cabin}須 ${g} ${unit}為一組才能購買，目前選了 ${q} ${unit}` }; }
      if (hit.prices.length > 1) return { err: 'ambiguous', msg: `專案中的「${cabin}」有多個價格（${hit.prices.map(p => p.toLocaleString('en-US')).join('、')}）` };
      const groups = q / hit.g;
      return { items: [{ label: cabin, price: hit.prices[0], qty: groups, unit: hit.g > 1 ? '組' : unit, note: hit.g > 1 ? `${q} ${unit}` : '' }] };
    }
    const incs = offers.filter(o => o.cabin === cabin && o.kind === 'inc');
    const base = pickTotal(offers.filter(o => o.cabin === '經濟艙' && o.kind === 'total'));
    if (incs.length && base && base.prices.length === 1 && cabin !== '經濟艙') {
      const incPrices = uniq(incs.map(o => o.price));
      if (incPrices.length > 1) return { err: 'ambiguous', msg: `專案中的「${cabin}」加價有多個金額（${incPrices.map(p => p.toLocaleString('en-US')).join('、')}）` };
      return { items: [
        { label: '經濟艙底價', price: base.prices[0], qty: q / base.g, unit: base.g > 1 ? '組' : unit, note: base.g > 1 ? `${q} ${unit}` : '' },
        { label: `升級${cabin}加價`, price: incPrices[0], qty: q, unit }
      ] };
    }
    return { err: 'missing', msg: `在專案文字中找不到「${cabin}」的價格` };
  }

  function priceRoom(raw, label, q) {
    const prices = [];
    norm(raw).split('\n').forEach(line => {
      if (/加價|升級|可加|升等/.test(line)) return;
      const i = line.indexOf(label); if (i < 0) return;
      const m = line.slice(i + label.length).match(/[^\d\n]{0,24}?\$?\s*([1-9]\d{2,5})(?!\d|\/\d{1,2}\/\d)/);
      if (m && (label === '加床' || Number(m[1]) >= 1000)) prices.push(Number(m[1]));
    });
    const u = uniq(prices);
    const unit = '間';
    if (!u.length) return { err: 'missing', msg: `在專案文字中找不到「${label}」的價格` };
    if (u.length > 1) return { err: 'ambiguous', msg: `專案中的「${label}」有多個價格（${u.map(p => p.toLocaleString('en-US')).join('、')}）` };
    return { items: [{ label, price: u[0], qty: q, unit, note: '' }] };
  }

  function starluxPrice(raw) {
    const m = norm(raw).match(/星宇[^\d\n]{0,10}[+＋]?\s*\$?\s*(\d{3,5})/);
    return m ? Number(m[1]) : 2000;
  }

  const api = { parseOffers, priceCabin, priceRoom, starluxPrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PMRPricing = api;
})(typeof window !== 'undefined' ? window : globalThis);
