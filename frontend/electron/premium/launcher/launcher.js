/* Quick launcher page (frameless window). Text comes from main (et()). */
(function () {
  const api = window.launcherAPI;
  const input = document.getElementById('q');
  const list = document.getElementById('results');
  const state = document.getElementById('state');
  const hint = document.getElementById('hint');
  const title = document.getElementById('ql-title');
  let strings = {};
  let items = [];
  let selected = 0;
  let seq = 0;
  let debounce = null;

  function applyStrings(s) {
    strings = s || {};
    input.placeholder = strings.placeholder || '';
    input.setAttribute('aria-label', strings.placeholder || '');
    hint.textContent = strings.hint || '';
    title.textContent = strings.title || '';
  }

  function initial(text) {
    const c = String(text || '').trim().charAt(0);
    return c ? c.toUpperCase() : '#';
  }

  function render() {
    list.textContent = '';
    items.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'item';
      li.id = `ql-item-${idx}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === selected ? 'true' : 'false');
      let mark;
      if (item.avatar) {
        mark = document.createElement('img');
        mark.src = item.avatar;
        mark.alt = '';
      } else {
        mark = document.createElement('div');
        mark.textContent = item.kind === 'channel' ? '#' : initial(item.title);
      }
      mark.className = `mark k-${item.kind}`;
      const copy = document.createElement('div');
      copy.className = 'copy';
      const t = document.createElement('span');
      t.className = 'title';
      t.textContent = item.title;
      copy.appendChild(t);
      if (item.subtitle) {
        const s = document.createElement('span');
        s.className = 'sub';
        s.textContent = item.subtitle;
        copy.appendChild(s);
      }
      li.appendChild(mark);
      li.appendChild(copy);
      li.addEventListener('mousemove', () => { if (selected !== idx) { selected = idx; render(); } });
      li.addEventListener('click', () => run(idx));
      list.appendChild(li);
    });
    if (items.length) input.setAttribute('aria-activedescendant', `ql-item-${selected}`);
    else input.removeAttribute('aria-activedescendant');
    const sel = list.children[selected];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  async function search() {
    const mine = ++seq;
    const q = input.value;
    let res = { results: [] };
    try { res = await api.query(q); } catch (_) { res = { results: [] }; }
    if (mine !== seq) return;
    items = Array.isArray(res.results) ? res.results : [];
    selected = 0;
    state.textContent = items.length ? '' : (strings.empty || '');
    render();
  }

  function run(idx) {
    const item = items[idx];
    if (!item) return;
    api.run(item);
  }

  input.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(search, 60);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); api.close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { selected = (selected + 1) % items.length; render(); } return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { selected = (selected - 1 + items.length) % items.length; render(); } return; }
    if (e.key === 'Enter') { e.preventDefault(); run(selected); }
  });

  api.onReset((s) => {
    applyStrings(s);
    input.value = '';
    input.focus();
    search();
  });

  api.strings().then((s) => { applyStrings(s); search(); }).catch(() => {});
  input.focus();
})();
