// AgriInsight AI — dashboard charts (live data)
// Every chart + KPI here is fetched from /api/... and re-fetched whenever
// a filter changes. No sample/hardcoded data.

(function () {
  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    primary: css.getPropertyValue('--primary').trim() || '#22C55E',
    accent: css.getPropertyValue('--accent').trim() || '#3B82F6',
    warning: css.getPropertyValue('--warning').trim() || '#F59E0B',
    text: css.getPropertyValue('--text-muted').trim() || '#94A3B8',
    grid: 'rgba(255,255,255,0.06)',
  };

  Chart.defaults.color = COLOR.text;
  Chart.defaults.font.family = "'Inter', ui-sans-serif, sans-serif";
  Chart.defaults.font.size = 12;

  const commonGrid = {
    grid: { color: COLOR.grid, drawTicks: false },
    ticks: { color: COLOR.text },
    border: { display: false },
  };

  const yearSel = document.getElementById('filterYear');
  const cropSel = document.getElementById('filterCrop');
  const stateSel = document.getElementById('filterState');
  const districtSel = document.getElementById('filterDistrict');
  const resetBtn = document.getElementById('resetFilters');

  if (!yearSel) return; // not on the dashboard page

  function currentFilters() {
    return {
      year: yearSel.value,
      crop: cropSel.value,
      state: stateSel.value,
      district: districtSel.value,
    };
  }

  function qs(params) {
    return new URLSearchParams(params).toString();
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  let charts = {};

  function upsertChart(key, ctxId, config) {
    if (charts[key]) {
      charts[key].data = config.data;
      charts[key].update();
      return;
    }
    const el = document.getElementById(ctxId);
    if (!el) return;
    charts[key] = new Chart(el, config);
  }

  async function refreshDistricts() {
    const state = stateSel.value;
    const list = await getJSON(`/api/districts?${qs({ state })}`);
    const current = districtSel.value;
    districtSel.innerHTML = '<option value="all">All districts</option>' +
      list.map((d) => `<option value="${d}">${d}</option>`).join('');
    // keep the previous selection if it still exists in the new list
    if (list.includes(current)) districtSel.value = current;
  }

  async function refreshKPIs() {
    const f = currentFilters();
    const data = await getJSON(`/api/kpis?${qs(f)}`);
    document.getElementById('kpiYield').textContent = data.avg_yield != null ? data.avg_yield.toLocaleString() : '–';
    document.getElementById('kpiStates').textContent = data.state_count ?? '–';
    document.getElementById('kpiRain').textContent = data.avg_rainfall ?? '–';
    document.getElementById('kpiPh').textContent = data.avg_ph ?? '–';

    const trendEl = document.getElementById('kpiYieldTrend');
    if (data.yield_delta_pct == null) {
      trendEl.textContent = '';
      trendEl.className = 'kpi-trend';
    } else {
      const up = data.yield_delta_pct >= 0;
      trendEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(data.yield_delta_pct)}%`;
      trendEl.className = `kpi-trend ${up ? 'pos' : 'neg'}`;
    }
  }

  async function refreshYieldTrend() {
    const f = currentFilters();
    const data = await getJSON(`/api/charts/yield-trend?${qs(f)}`);
    upsertChart('yieldTrend', 'yieldTrendChart', {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Avg yield (kg/ha)',
          data: data.data,
          borderColor: COLOR.primary,
          backgroundColor: 'rgba(34,197,94,0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: data.labels.length > 30 ? 0 : 3,
          pointBackgroundColor: COLOR.primary,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: commonGrid },
      },
    });
  }

  async function refreshTopCrops() {
    // top-crops is more useful without the crop filter applied to itself
    const f = currentFilters();
    const { crop, ...rest } = f;
    const data = await getJSON(`/api/charts/top-crops?${qs(rest)}`);
    upsertChart('topCrops', 'topCropsChart', {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Avg yield (kg/ha)',
          data: data.data,
          backgroundColor: COLOR.accent,
          borderRadius: 6,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: commonGrid },
      },
    });
  }

  async function refreshRainfallYield() {
    const f = currentFilters();
    const data = await getJSON(`/api/charts/rainfall-yield?${qs(f)}`);
    upsertChart('rainfallYield', 'rainfallYieldChart', {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Records',
          data: data.points,
          backgroundColor: COLOR.warning,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...commonGrid, title: { display: true, text: 'Rainfall (mm)', color: COLOR.text } },
          y: { ...commonGrid, title: { display: true, text: 'Yield (kg/ha)', color: COLOR.text } },
        },
      },
    });
  }

  async function refreshNPK() {
    const f = currentFilters();
    const data = await getJSON(`/api/charts/npk?${qs(f)}`);
    upsertChart('npk', 'npkChart', {
      type: 'radar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Filtered selection (normalized)',
          data: data.data,
          borderColor: COLOR.primary,
          backgroundColor: 'rgba(34,197,94,0.15)',
          pointBackgroundColor: COLOR.primary,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 100,
            grid: { color: COLOR.grid },
            angleLines: { color: COLOR.grid },
            pointLabels: { color: COLOR.text },
            ticks: { display: false, backdropColor: 'transparent' },
          },
        },
      },
    });
  }

  async function refreshAll() {
    await Promise.all([
      refreshKPIs(),
      refreshYieldTrend(),
      refreshTopCrops(),
      refreshRainfallYield(),
      refreshNPK(),
    ]).catch((err) => console.error('Dashboard refresh failed:', err));
  }

  yearSel.addEventListener('change', refreshAll);
  cropSel.addEventListener('change', refreshAll);
  districtSel.addEventListener('change', refreshAll);
  stateSel.addEventListener('change', async () => {
    await refreshDistricts();
    refreshAll();
  });
  resetBtn.addEventListener('click', async () => {
    yearSel.value = 'all';
    cropSel.value = 'all';
    stateSel.value = 'all';
    await refreshDistricts();
    districtSel.value = 'all';
    refreshAll();
  });

  refreshDistricts().then(refreshAll);
})();
