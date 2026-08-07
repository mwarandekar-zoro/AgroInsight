// AgroInsight AI — shared front-end behaviour

document.addEventListener('DOMContentLoaded', () => {
  // Reveal feature cards / insight cards (landing page) and KPI/chart/AI
  // insight cards (dashboard-style pages) as they scroll into view.
  // Landing-page cards use main.js's own inline fade; dashboard cards use
  // the `in-view` CSS class defined in dashboard.css (fade for KPI cards,
  // a more pronounced slide for chart cards) so both look intentional
  // rather than just "everything fades the same way".
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

  const dashTargets = document.querySelectorAll('.kpi-card, .chart-card, .ai-insight-card');
  if (dashTargets.length && 'IntersectionObserver' in window) {
    // Stagger by DOM order so cards in the same grid cascade in rather
    // than popping simultaneously — capped so long chart lists (13
    // charts on /dashboard) don't end up with a multi-second tail delay.
    dashTargets.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 8) * 45}ms`;
    });
    const dashIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          dashIo.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    dashTargets.forEach((el) => dashIo.observe(el));
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

  // Weather widget — live current conditions for New Delhi via
  // routes/weather.py (Open-Meteo, no API key). Fetched once on load so
  // the badge is populated before the person even opens the panel;
  // clicking just toggles the already-fetched detail. If the request
  // fails (no internet, Open-Meteo down) this shows an honest
  // "unavailable" message rather than a fabricated reading.
  const weatherBtn = document.getElementById('weatherBtn');
  const weatherPanel = document.getElementById('weatherPanel');
  const weatherBody = document.getElementById('weatherBody');
  const weatherBadge = document.getElementById('weatherBadge');
  if (weatherBtn && weatherPanel && weatherBody) {
    fetch('/api/weather')
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        if (weatherBadge) {
          weatherBadge.textContent = `${Math.round(data.temperature_c)}°`;
          weatherBadge.hidden = false;
        }
        weatherBody.innerHTML = `
          <div class="weather-reading">
            <div class="weather-icon">${data.icon}</div>
            <div>
              <div class="weather-temp">${Math.round(data.temperature_c)}°C</div>
              <div class="weather-condition">${data.condition}</div>
            </div>
          </div>
          <div class="weather-wind">Wind ${Math.round(data.wind_kmh)} km/h · ${data.location}</div>`;
      })
      .catch(() => {
        weatherBody.innerHTML = '<div class="weather-error">Weather is unavailable right now.</div>';
      });

    weatherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      weatherPanel.hidden = !weatherPanel.hidden;
    });
    weatherPanel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { weatherPanel.hidden = true; });
  }
});

// Count-up animation for headline numbers (KPI cards etc). Exposed on
// window so charts.js (loaded after this file, dashboard-only) can
// reuse it without duplicating the easing/formatting logic. Respects
// prefers-reduced-motion by jumping straight to the end value.
window.animateCountUp = function animateCountUp(el, endValue, opts) {
  if (!el || endValue == null || Number.isNaN(endValue)) {
    if (el) el.textContent = endValue == null ? '–' : String(endValue);
    return;
  }
  const options = opts || {};
  const decimals = options.decimals ?? 0;
  const duration = options.duration ?? 700;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const format = (n) => n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (reduceMotion) {
    el.textContent = format(endValue);
    return;
  }

  const startValue = parseFloat((el.textContent || '0').replace(/,/g, '')) || 0;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
    const current = startValue + (endValue - startValue) * eased;
    el.textContent = format(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};
