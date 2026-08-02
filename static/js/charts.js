// AgroInsight AI — dashboard charts (live data)
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

  const yearMS = document.getElementById('filterYear');
  if (!yearMS) return; // not on the dashboard page

  const filterMS = {
    year: new MultiSelect(yearMS, 'All years', () => refreshAll()),
    crop: new MultiSelect(document.getElementById('filterCrop'), 'All crops', () => refreshAll()),
    state: new MultiSelect(document.getElementById('filterState'), 'All states', async () => {
      await refreshDistricts();
      refreshAll();
    }),
    district: new MultiSelect(document.getElementById('filterDistrict'), 'All districts', () => refreshAll()),
  };
  const resetBtn = document.getElementById('resetFilters');

  function currentFilters() {
    return {
      year: filterMS.year.getValues().join(','),
      crop: filterMS.crop.getValues().join(','),
      state: filterMS.state.getValues().join(','),
      district: filterMS.district.getValues().join(','),
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
    const state = filterMS.state.getValues().join(',');
    const list = await getJSON(`/api/districts?${qs({ state })}`);
    filterMS.district.setOptions(list);
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

  async function refreshAreaGrowth() {
    const f = currentFilters();
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
    });
  }

  async function refreshTopStates() {
    const f = currentFilters();
    const { state, ...rest } = f;
    const data = await getJSON(`/api/charts/top-states?${qs(rest)}`);
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
    });
  }

  async function refreshStateYield() {
    const f = currentFilters();
    const { state, ...rest } = f;
    const data = await getJSON(`/api/charts/state-yield?${qs(rest)}`);
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
    });
  }

  async function refreshTopDistricts() {
    const f = currentFilters();
    const { district, ...rest } = f;
    const data = await getJSON(`/api/charts/top-districts?${qs(rest)}`);
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
    });
  }

  async function refreshTemperatureYield() {
    const f = currentFilters();
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
          y: { ...commonGrid, title: { display: true, text: 'Yield (kg/ha)', color: COLOR.text } },
        },
      },
    });
  }

  async function refreshHumidityYield() {
    const f = currentFilters();
    const data = await getJSON(`/api/charts/humidity-yield?${qs(f)}`);
    upsertChart('humidityYield', 'humidityYieldChart', {
      type: 'scatter',
      data: { datasets: [{ label: 'Records', data: data.points, backgroundColor: COLOR.primary }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...commonGrid, title: { display: true, text: 'Humidity (%)', color: COLOR.text } },
          y: { ...commonGrid, title: { display: true, text: 'Yield (kg/ha)', color: COLOR.text } },
        },
      },
    });
  }

  async function refreshPhDistribution() {
    const f = currentFilters();
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
    });
  }

  async function refreshCropDistribution() {
    const f = currentFilters();
    const { crop, ...rest } = f;
    const data = await getJSON(`/api/charts/crop-distribution?${qs(rest)}`);
    upsertChart('cropDistribution', 'cropDistributionChart', {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.data,
          backgroundColor: [COLOR.primary, COLOR.accent, COLOR.warning, '#EF4444'],
          borderColor: 'transparent',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, color: COLOR.text } } },
      },
    });
  }

  function heatmapColor(intensity) {
    // 0 -> faint, 100 -> full primary green, interpolated as opacity
    const alpha = 0.08 + (intensity / 100) * 0.75;
    return `rgba(34,197,94,${alpha.toFixed(2)})`;
  }

  async function refreshHeatmap() {
    const f = currentFilters();
    const { state, crop, ...rest } = f;
    const data = await getJSON(`/api/charts/heatmap?${qs(rest)}`);
    const container = document.getElementById('yieldHeatmap');
    if (!container) return;

    let html = '<table class="heatmap-table"><thead><tr><th></th>';
    data.crops.forEach((c) => { html += `<th class="crop-col">${c}</th>`; });
    html += '</tr></thead><tbody>';

    data.states.forEach((state, i) => {
      html += `<tr><td class="state-label">${state}</td>`;
      data.matrix[i].forEach((cell) => {
        const bg = heatmapColor(cell.intensity);
        const label = cell.value != null ? cell.value : '–';
        html += `<td><div class="heatmap-cell" style="background:${bg};" title="${state}: ${label} kg/ha">${label}</div></td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  async function refreshAll() {
    await Promise.all([
      refreshKPIs(),
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

  async function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const crop = params.get('crop');
    const state = params.get('state');
    const year = params.get('year');
    const district = params.get('district');

    // Links from the AI Assistant / other pages pass a single value each —
    // still works fine as a one-item selection in the multi-select.
    if (crop) filterMS.crop.setValues(crop.split(','));
    if (year) filterMS.year.setValues(year.split(','));

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
