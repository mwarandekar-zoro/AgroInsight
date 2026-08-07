// AgroInsight AI — dashboard charts (live data)
// Every chart + KPI here is fetched from /api/... and re-fetched whenever
// a filter changes. No sample/hardcoded data.

(function () {
  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    primary: css.getPropertyValue('--primary').trim() || '#22C55E',
    accent:  css.getPropertyValue('--accent').trim()  || '#3B82F6',
    warning: css.getPropertyValue('--warning').trim() || '#F59E0B',
    text:    css.getPropertyValue('--text-muted').trim() || '#94A3B8',
    grid:    'rgba(255,255,255,0.06)',
  };

  Chart.defaults.color       = COLOR.text;
  Chart.defaults.font.family = "'Inter', ui-sans-serif, sans-serif";
  Chart.defaults.font.size   = 12;

  // ChartZoom plugin self-registers when its script is loaded — do NOT call
  // Chart.register(ChartZoom) here again or it throws "Plugin already registered"
  // and kills the entire JS module. Wrap in try/catch so any plugin error never
  // prevents charts from rendering.
  let zoomAvailable = false;
  try {
    zoomAvailable = typeof ChartZoom !== 'undefined' && typeof Hammer !== 'undefined';
  } catch (e) { /* ignore */ }

  const commonGrid = {
    grid:   { color: COLOR.grid, drawTicks: false },
    ticks:  { color: COLOR.text },
    border: { display: false },
  };

  // -------------------------------------------------------
  // Fullscreen Modal
  // -------------------------------------------------------
  const modalEl = document.createElement('div');
  modalEl.id = 'chartModal';
  modalEl.innerHTML = `
    <div class="chart-modal-box">
      <div class="chart-modal-header">
        <span class="chart-modal-title" id="chartModalTitle">Chart</span>
        <div class="chart-modal-close" id="chartModalClose" title="Close">✕</div>
      </div>
      <div class="chart-modal-hint">🖱 Scroll to zoom &nbsp;|&nbsp; Drag to pan &nbsp;|&nbsp; Double-click to reset zoom</div>
      <div class="chart-modal-canvas-wrap">
        <canvas id="chartModalCanvas"></canvas>
      </div>
    </div>`;
  document.body.appendChild(modalEl);

  let modalChartInstance = null;

  function closeModal() {
    modalEl.classList.remove('open');
    if (modalChartInstance) {
      modalChartInstance.destroy();
      modalChartInstance = null;
    }
  }

  document.getElementById('chartModalClose').addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  function openModal(chartInstance, title) {
    document.getElementById('chartModalTitle').textContent = title || 'Chart';
    const canvas = document.getElementById('chartModalCanvas');

    if (modalChartInstance) {
      modalChartInstance.destroy();
      modalChartInstance = null;
    }

    // Build a fresh, serialization-safe config from the chart's live data.
    // We CANNOT use JSON.parse(JSON.stringify(config)) because Chart.js configs
    // contain functions (callbacks, tick formatters) that JSON cannot serialize.
    const src = chartInstance.config;
    const freshCfg = {
      type: src.type,
      data: src.data,   // data arrays are plain objects — safe to share by ref
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: Object.assign({}, src.options && src.options.plugins),
        scales: src.options && src.options.scales,
        indexAxis: src.options && src.options.indexAxis,
      },
    };
    if (zoomAvailable) {
      freshCfg.options.plugins.zoom = buildZoomOptions();
    }

    modalEl.classList.add('open');

    // Let CSS layout settle before rendering
    requestAnimationFrame(() => {
      try {
        modalChartInstance = new Chart(canvas.getContext('2d'), freshCfg);
      } catch (err) {
        console.error('Modal chart failed to render:', err);
      }
    });
  }

  // -------------------------------------------------------
  // Zoom plugin options factory
  // -------------------------------------------------------
  function buildZoomOptions() {
    return {
      pan: {
        enabled: true,
        mode: 'xy',
        threshold: 5,
      },
      zoom: {
        wheel: { enabled: true, speed: 0.08 },
        pinch: { enabled: true },
        mode: 'xy',
        onZoomComplete({ chart }) {
          chart.update('none');
        },
      },
      limits: {
        x: { minRange: 1 },
        y: { minRange: 1 },
      },
    };
  }

  function applyZoomToConfig(config) {
    if (!zoomAvailable) return;
    config.options = config.options || {};
    config.options.plugins = config.options.plugins || {};
    config.options.plugins.zoom = buildZoomOptions();
  }

  function destroyExistingChart(el) {
    if (!el) return;
    const existing = Chart.getChart(el);
    if (existing) {
      existing.destroy();
    }
  }

  // -------------------------------------------------------
  // Controls: fullscreen + export attached to each chart card
  // -------------------------------------------------------
  function attachControls(chartInstance, canvasId, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const card = canvas.closest('.chart-card');
    if (!card) return;

    const fsBtn = card.querySelector('.icon-btn[title="Fullscreen"]');
    const exBtn = card.querySelector('.icon-btn[title="Export"]');

    if (fsBtn) {
      // Remove previous listeners by cloning
      const newFs = fsBtn.cloneNode(true);
      fsBtn.parentNode.replaceChild(newFs, fsBtn);
      newFs.addEventListener('click', () => openModal(chartInstance, title));
    }

    if (exBtn) {
      const newEx = exBtn.cloneNode(true);
      exBtn.parentNode.replaceChild(newEx, exBtn);
      newEx.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href     = chartInstance.toBase64Image('image/png', 1);
        link.download = (title || canvasId).replace(/\s+/g, '_') + '.png';
        link.click();
      });
    }

    // Double-click on chart canvas to reset zoom
    canvas.addEventListener('dblclick', () => {
      chartInstance.resetZoom && chartInstance.resetZoom();
    });
  }

  // -------------------------------------------------------
  // Filters
  // -------------------------------------------------------
  const yearMS = document.getElementById('filterYear');
  if (!yearMS) return; // not on dashboard page

  const filterMS = {
    year:     new MultiSelect(yearMS, 'All years', () => refreshAll()),
    crop:     new MultiSelect(document.getElementById('filterCrop'),     'All crops',     () => refreshAll()),
    state:    new MultiSelect(document.getElementById('filterState'),    'All states',    async () => { await refreshDistricts(); refreshAll(); }),
    district: new MultiSelect(document.getElementById('filterDistrict'), 'All districts', () => refreshAll()),
  };

  const resetBtn = document.getElementById('resetFilters');

  function currentFilters() {
    return {
      year:     filterMS.year.getValues().join(','),
      crop:     filterMS.crop.getValues().join(','),
      state:    filterMS.state.getValues().join(','),
      district: filterMS.district.getValues().join(','),
    };
  }

  function qs(params) { return new URLSearchParams(params).toString(); }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  // -------------------------------------------------------
  // Chart registry
  // -------------------------------------------------------
  let charts = {};

  function upsertChart(key, ctxId, config, title) {
    applyZoomToConfig(config);

    const el = document.getElementById(ctxId);
    if (!el) return;

    if (charts[key]) {
      charts[key].data    = config.data;
      charts[key].options = config.options;
      try {
        charts[key].update();
      } catch (err) {
        console.error(`Chart update failed for ${key}:`, err);
        if (zoomAvailable && config.options && config.options.plugins) {
          delete config.options.plugins.zoom;
          try {
            charts[key].update();
          } catch (retryErr) {
            console.error(`Chart update retry failed for ${key}:`, retryErr);
          }
        }
      }
      attachControls(charts[key], ctxId, title || key);
      return;
    }

    destroyExistingChart(el);

    try {
      const instance = new Chart(el, config);
      charts[key] = instance;
      attachControls(instance, ctxId, title || key);
    } catch (err) {
      console.error(`Chart render failed for ${key}:`, err);
      if (zoomAvailable && config.options && config.options.plugins) {
        delete config.options.plugins.zoom;
      }
      destroyExistingChart(el);
      try {
        const instance = new Chart(el, config);
        charts[key] = instance;
        attachControls(instance, ctxId, title || key);
      } catch (retryErr) {
        console.error(`Chart render retry failed for ${key}:`, retryErr);
      }
    }
  }

  // -------------------------------------------------------
  // District loader
  // -------------------------------------------------------
  async function refreshDistricts() {
    const state = filterMS.state.getValues().join(',');
    const list  = await getJSON(`/api/districts?${qs({ state })}`);
    filterMS.district.setOptions(list);
  }

  // -------------------------------------------------------
  // KPIs
  // -------------------------------------------------------
  async function refreshKPIs() {
    const f    = currentFilters();
    const data = await getJSON(`/api/kpis?${qs(f)}`);

    if (data.avg_yield != null) {
      window.animateCountUp(document.getElementById('kpiYield'), data.avg_yield, { decimals: 0 });
    } else {
      document.getElementById('kpiYield').textContent = '–';
    }
    document.getElementById('kpiStates').textContent = data.state_count ?? '–';
    document.getElementById('kpiRain').textContent   = data.avg_rainfall != null ? data.avg_rainfall.toLocaleString() : '–';
    document.getElementById('kpiPh').textContent     = data.avg_ph ?? '–';

    const areaEl = document.getElementById('kpiArea');
    if (areaEl) {
      if (data.total_area != null) {
        window.animateCountUp(areaEl, data.total_area, { compact: true });
      } else {
        areaEl.textContent = '–';
      }
    }

    const tempEl = document.getElementById('kpiTemp');
    if (tempEl) {
      tempEl.textContent = data.avg_temp != null ? `${data.avg_temp}°` : '–';
    }

    const trendEl = document.getElementById('kpiYieldTrend');
    if (data.yield_delta_pct == null) {
      trendEl.textContent = '';
      trendEl.className   = 'kpi-trend';
    } else {
      const up = data.yield_delta_pct >= 0;
      trendEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(data.yield_delta_pct)}%`;
      trendEl.className   = `kpi-trend ${up ? 'pos' : 'neg'}`;
    }
    return data;
  }

  // AI Insight card (hero row) — dynamically responds to filter changes
  // -------------------------------------------------------
  async function refreshAIInsight() {
    const body = document.getElementById('aiInsightBody');
    if (!body) return;
    try {
      const f = currentFilters();
      const [kpiData, topCrops] = await Promise.all([
        getJSON(`/api/kpis?${qs(f)}`),
        getJSON(`/api/charts/top-crops?${qs(f)}`),
      ]);

      const filterParts = [];
      if (f.year) filterParts.push(`Year: ${f.year}`);
      if (f.crop) filterParts.push(`Crop: ${f.crop}`);
      if (f.state) filterParts.push(`State: ${f.state}`);
      if (f.district) filterParts.push(`District: ${f.district}`);

      const lines = [];

      if (filterParts.length) {
        lines.push(`<div style="display:inline-block; font-size:11px; font-family:var(--font-mono); background:rgba(34,197,94,0.12); color:var(--primary); padding:3px 10px; border-radius:12px; margin-bottom:8px;">🔍 Active Filter: ${filterParts.join(' • ')}</div>`);
      }

      if (topCrops.labels && topCrops.labels.length) {
        lines.push(`<strong>${topCrops.labels[0]}</strong> leads the current filtered view with <strong>${topCrops.data[0].toLocaleString()} kg/ha</strong> average yield.`);
      }

      if (kpiData.yield_delta_pct != null) {
        const up = kpiData.yield_delta_pct >= 0;
        lines.push(`Year-over-year yield momentum is ${up ? 'up' : 'down'} <strong>${up ? '▲' : '▼'} ${Math.abs(kpiData.yield_delta_pct)}%</strong> across the latest recorded period.`);
      }

      if (kpiData.total_area != null && kpiData.total_area > 0) {
        const distText = kpiData.district_count ? ` across ${kpiData.district_count.toLocaleString()} district${kpiData.district_count === 1 ? '' : 's'}` : '';
        const stateText = kpiData.state_count ? ` in ${kpiData.state_count} state${kpiData.state_count === 1 ? '' : 's'}` : '';
        lines.push(`Total harvested land area covers <strong>${kpiData.total_area.toLocaleString()} ha</strong>${distText}${stateText}.`);
      }

      if (kpiData.avg_rainfall != null || kpiData.avg_temp != null) {
        const rainStr = kpiData.avg_rainfall != null ? `${kpiData.avg_rainfall} mm rainfall` : '';
        const tempStr = kpiData.avg_temp != null ? `${kpiData.avg_temp}°C average temp` : '';
        const envStr = [rainStr, tempStr].filter(Boolean).join(' and ');
        lines.push(`Environmental conditions reflect <strong>${envStr}</strong>.`);
      }

      if (kpiData.avg_ph != null) {
        let phStatus = 'optimal neutral range';
        if (kpiData.avg_ph < 6.0) phStatus = 'slightly acidic condition (soil conditioning recommended)';
        else if (kpiData.avg_ph > 7.5) phStatus = 'alkaline condition';
        lines.push(`Soil pH averages <strong>${kpiData.avg_ph}</strong>, indicating ${phStatus}.`);
      }

      body.innerHTML = lines.length
        ? lines.map((l) => `<p style="margin-bottom:8px;">${l}</p>`).join('')
        : '<p>Not enough data in the current filter selection to summarize.</p>';
    } catch (err) {
      body.innerHTML = '<p>Insight is unavailable right now.</p>';
    }
  }

  // -------------------------------------------------------
  // Individual chart refreshers
  // -------------------------------------------------------
  async function refreshYieldTrend() {
    const f    = currentFilters();
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
    }, 'Year-wise yield trend');
  }

  async function refreshTopCrops() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/top-crops?${qs(f)}`);
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
    }, 'Top crops by yield');
  }

  async function refreshRainfallYield() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/rainfall-yield?${qs(f)}`);
    upsertChart('rainfallYield', 'rainfallYieldChart', {
      type: 'scatter',
      data: { datasets: [{ label: 'Records', data: data.points, backgroundColor: COLOR.warning }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...commonGrid, title: { display: true, text: 'Rainfall (mm)', color: COLOR.text } },
          y: { ...commonGrid, title: { display: true, text: 'Yield (kg/ha)', color: COLOR.text } },
        },
      },
    }, 'Rainfall vs yield');
  }

  async function refreshNPK() {
    const f    = currentFilters();
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
    }, 'Soil NPK balance');
  }

  async function refreshAreaGrowth() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/area-growth?${qs(f)}`);
    upsertChart('areaGrowth', 'areaGrowthChart', {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Total area harvested (ha)',
          data: data.data,
          borderColor: COLOR.accent,
          backgroundColor: 'rgba(59,130,246,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: commonGrid },
      },
    }, 'Area harvested growth');
  }

  async function refreshTopStates() {
    const f              = currentFilters();
    const { state, ...rest } = f;
    const data           = await getJSON(`/api/charts/top-states?${qs(rest)}`);
    upsertChart('topStates', 'topStatesChart', {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Avg yield (kg/ha)', data: data.data, backgroundColor: COLOR.primary, borderRadius: 5, maxBarThickness: 22 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: { ...commonGrid, ticks: { color: COLOR.text, autoSkip: false } } },
      },
    }, 'Top 10 states by yield');
  }

  async function refreshStateYield() {
    const f              = currentFilters();
    const { state, ...rest } = f;
    const data           = await getJSON(`/api/charts/state-yield?${qs(rest)}`);
    upsertChart('stateYield', 'stateYieldChart', {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Avg yield (kg/ha)', data: data.data, backgroundColor: COLOR.accent, borderRadius: 5, maxBarThickness: 20 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: { ...commonGrid, ticks: { color: COLOR.text, autoSkip: false, font: { size: 10.5 } } } },
      },
    }, 'State-wise yield');
  }

  async function refreshTopDistricts() {
    const f                  = currentFilters();
    const { district, ...rest } = f;
    const data               = await getJSON(`/api/charts/top-districts?${qs(rest)}`);
    upsertChart('topDistricts', 'topDistrictsChart', {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Avg yield (kg/ha)', data: data.data, backgroundColor: COLOR.warning, borderRadius: 5, maxBarThickness: 22 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: { ...commonGrid, ticks: { color: COLOR.text, autoSkip: false, font: { size: 10.5 } } } },
      },
    }, 'Top 10 districts by yield');
  }

  async function refreshTemperatureYield() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/temperature-yield?${qs(f)}`);
    upsertChart('temperatureYield', 'temperatureYieldChart', {
      type: 'scatter',
      data: { datasets: [{ label: 'Records', data: data.points, backgroundColor: COLOR.accent }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...commonGrid, title: { display: true, text: 'Temperature (°C)', color: COLOR.text } },
          y: { ...commonGrid, title: { display: true, text: 'Yield (kg/ha)',     color: COLOR.text } },
        },
      },
    }, 'Temperature vs yield');
  }

  async function refreshHumidityYield() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/humidity-yield?${qs(f)}`);
    upsertChart('humidityYield', 'humidityYieldChart', {
      type: 'scatter',
      data: { datasets: [{ label: 'Records', data: data.points, backgroundColor: COLOR.primary }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...commonGrid, title: { display: true, text: 'Humidity (%)',   color: COLOR.text } },
          y: { ...commonGrid, title: { display: true, text: 'Yield (kg/ha)', color: COLOR.text } },
        },
      },
    }, 'Humidity vs yield');
  }

  async function refreshPhDistribution() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/ph-distribution?${qs(f)}`);
    upsertChart('phDistribution', 'phDistributionChart', {
      type: 'bar',
      data: {
        labels: data.labels.map((v) => `pH ${v}`),
        datasets: [{ label: 'Records', data: data.data, backgroundColor: COLOR.warning, borderRadius: 6, maxBarThickness: 60 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: commonGrid },
      },
    }, 'Soil pH distribution');
  }

  async function refreshCropDistribution() {
    const f           = currentFilters();
    const { crop, ...rest } = f;
    const data        = await getJSON(`/api/charts/crop-distribution?${qs(rest)}`);
    upsertChart('cropDistribution', 'cropDistributionChart', {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.data,
          backgroundColor: [COLOR.primary, COLOR.accent, COLOR.warning, '#EF4444', '#8B5CF6', '#EC4899'],
          borderColor: 'transparent',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, color: COLOR.text } } },
      },
    }, 'Crop distribution by area');
  }

  // -------------------------------------------------------
  // Heatmap (not a Chart.js chart, no zoom needed)
  // -------------------------------------------------------
  function heatmapColor(intensity) {
    const alpha = 0.08 + (intensity / 100) * 0.75;
    return `rgba(34,197,94,${alpha.toFixed(2)})`;
  }

  async function refreshHeatmap() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/heatmap?${qs(f)}`);
    const container       = document.getElementById('yieldHeatmap');
    if (!container) return;

    let html = '<table class="heatmap-table"><thead><tr><th></th>';
    data.crops.forEach((c) => { html += `<th class="crop-col">${c}</th>`; });
    html += '</tr></thead><tbody>';

    data.states.forEach((state, i) => {
      html += `<tr><td class="state-label">${state}</td>`;
      data.matrix[i].forEach((cell) => {
        const bg    = heatmapColor(cell.intensity);
        const label = cell.value != null ? cell.value : '–';
        html += `<td><div class="heatmap-cell" style="background:${bg};" title="${state}: ${label} kg/ha">${label}</div></td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  async function refreshStateArea() {
    const f    = currentFilters();
    const data = await getJSON(`/api/charts/state-area?${qs(f)}`);
    upsertChart('stateArea', 'stateAreaChart', {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Total area (ha)',
          data: data.data,
          backgroundColor: COLOR.accent,
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: commonGrid, y: commonGrid },
      },
    }, 'State-wise total area');
  }

  // -------------------------------------------------------
  // Refresh all
  // -------------------------------------------------------
  async function refreshAll() {
    await Promise.all([
      refreshKPIs(),
      refreshAIInsight(),
      refreshYieldTrend(),
      refreshAreaGrowth(),
      refreshTopCrops(),
      refreshTopStates(),
      refreshRainfallYield(),
      refreshTemperatureYield(),
      refreshHumidityYield(),
      refreshPhDistribution(),
      refreshNPK(),
      refreshCropDistribution(),
      refreshStateYield(),
      refreshTopDistricts(),
      refreshStateArea(),
      refreshHeatmap(),
    ]).catch((err) => console.error('Dashboard refresh failed:', err));
  }

  resetBtn.addEventListener('click', async () => {
    filterMS.year.clear();
    filterMS.crop.clear();
    filterMS.state.clear();
    await refreshDistricts();
    filterMS.district.clear();
    refreshAll();
  });

  // -------------------------------------------------------
  // URL param pre-selection
  // -------------------------------------------------------
  async function applyUrlParams() {
    const params   = new URLSearchParams(window.location.search);
    const crop     = params.get('crop');
    const state    = params.get('state');
    const year     = params.get('year');
    const district = params.get('district');

    if (crop)  filterMS.crop.setValues(crop.split(','));
    if (year)  filterMS.year.setValues(year.split(','));

    if (state) {
      filterMS.state.setValues(state.split(','));
      await refreshDistricts();
      if (district) filterMS.district.setValues(district.split(','));
    } else {
      await refreshDistricts();
    }
  }

  applyUrlParams().then(refreshAll);
})();
