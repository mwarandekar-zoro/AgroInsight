// AgroInsight AI — shared front-end behaviour

document.addEventListener('DOMContentLoaded', () => {
  // Reveal feature cards / insight cards as they scroll into view
  const revealTargets = document.querySelectorAll('.feature-card, .insight-card');
  if (revealTargets.length && 'IntersectionObserver' in window) {
    revealTargets.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(14px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach((el) => io.observe(el));
  }

  // Theme toggle (dashboard topbar) — persisted so it survives page loads,
  // since this is a real multi-page app, not a single-page artifact.
  const themeBtn = document.querySelector('.icon-btn[title="Toggle theme"]');
  if (themeBtn) {
    const isLight = document.documentElement.classList.contains('light-theme');
    themeBtn.textContent = isLight ? '☀️' : '🌙';

    themeBtn.addEventListener('click', () => {
      const nowLight = !document.documentElement.classList.contains('light-theme');
      try {
        localStorage.setItem('agroinsight-theme', nowLight ? 'light' : 'dark');
      } catch (e) { /* localStorage unavailable — theme just won't persist */ }
      // Reload rather than toggle in place: Chart.js reads CSS variables
      // once at chart creation time, so any charts on the page would stay
      // the wrong color until reload anyway. This keeps every element —
      // charts included — consistently themed with zero extra wiring.
      window.location.reload();
    });
  }

  // Topbar search (crops / states / districts) — present on every
  // logged-in page's header. Debounced fetch to /api/search, results
  // grouped by type, click/Enter jumps to the dashboard pre-filtered.
  const searchInput = document.getElementById('topbarSearchInput');
  const searchResults = document.getElementById('topbarSearchResults');
  if (searchInput && searchResults) {
    let debounceTimer = null;
    let activeIndex = -1;
    let items = []; // flat list of {el, handler} in the order rendered

    const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    function closeResults() {
      searchResults.innerHTML = '';
      activeIndex = -1;
      items = [];
    }

    function goTo(params) {
      window.location.href = `/dashboard?${new URLSearchParams(params).toString()}`;
    }

    function renderGroupHtml(label, rows) {
      if (!rows.length) return '';
      let html = `<div class="sr-group-label">${label}</div>`;
      rows.forEach((row) => {
        html += `<div class="sr-item">${escapeHtml(row.label)}</div>`;
      });
      return html;
    }

    async function runSearch(q) {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`search -> ${res.status}`);
        const data = await res.json();

        const total = data.crops.length + data.states.length + data.districts.length;
        if (total === 0) {
          searchResults.innerHTML = `<div class="sr-empty">No matches for "${escapeHtml(q)}"</div>`;
          items = [];
          activeIndex = -1;
          return;
        }

        searchResults.innerHTML =
          renderGroupHtml('Crops', data.crops) +
          renderGroupHtml('States', data.states) +
          renderGroupHtml('Districts', data.districts);

        // Walk the three arrays in the exact order rendered above so
        // each DOM node lines up with the row it represents.
        items = [];
        const nodes = Array.from(searchResults.querySelectorAll('.sr-item'));
        let cursor = 0;
        const attach = (rows, handler) => {
          rows.forEach((row) => {
            const el = nodes[cursor++];
            const fn = () => handler(row);
            el.addEventListener('click', fn);
            items.push({ el, handler: fn });
          });
        };
        attach(data.crops, (row) => goTo({ crop: row.value }));
        attach(data.states, (row) => goTo({ state: row.value }));
        attach(data.districts, (row) => goTo({ state: row.state, district: row.value }));

        activeIndex = -1;
      } catch (err) {
        console.error('Search failed:', err);
        searchResults.innerHTML = '<div class="sr-empty">Search is unavailable right now.</div>';
        items = [];
      }
    }

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < 2) {
        closeResults();
        return;
      }
      debounceTimer = setTimeout(() => runSearch(q), 220);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeResults();
        searchInput.blur();
        return;
      }
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0) items[activeIndex].handler();
        return;
      } else {
        return;
      }
      items.forEach((it, idx) => it.el.classList.toggle('active', idx === activeIndex));
      items[activeIndex].el.scrollIntoView({ block: 'nearest' });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#topbarSearch')) closeResults();
    });
  }

  // Notification bell — no backend notification system exists yet, so
  // this is an honest empty-state dropdown (toggle + click-outside-to-
  // close) instead of a dead icon with a fake permanent "unread" dot.
  const notifBtn = document.getElementById('notifBtn');
  const notifPanel = document.getElementById('notifPanel');
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifPanel.hidden = !notifPanel.hidden;
    });
    notifPanel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { notifPanel.hidden = true; });
  }
});
