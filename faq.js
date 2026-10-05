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
