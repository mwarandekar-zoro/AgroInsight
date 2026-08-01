// AgriInsight AI — crop comparison page

(function () {
  const cropASel = document.getElementById('cropA');
  const cropBSel = document.getElementById('cropB');
  if (!cropASel) return;

  const errorEl = document.getElementById('compareError');
  const metricsEl = document.getElementById('compareMetrics');

  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    primary: css.getPropertyValue('--primary').trim() || '#22C55E',
    accent: css.getPropertyValue('--accent').trim() || '#3B82F6',
    text: css.getPropertyValue('--text-muted').trim() || '#94A3B8',
    grid: 'rgba(255,255,255,0.06)',
  };
  Chart.defaults.color = COLOR.text;
  Chart.defaults.font.family = "'Inter', ui-sans-serif, sans-serif";

  const METRICS = [
    { key: 'avg_yield', label: 'Avg yield (kg/ha)', highlightWinner: true },
    { key: 'avg_temperature', label: 'Avg temperature (°C)' },
    { key: 'avg_humidity', label: 'Avg humidity (%)' },
    { key: 'avg_rainfall', label: 'Avg rainfall (mm)' },
    { key: 'avg_ph', label: 'Avg soil pH' },
    { key: 'avg_n', label: 'Nitrogen req (kg/ha)' },
    { key: 'avg_p', label: 'Phosphorus req (kg/ha)' },
    { key: 'avg_k', label: 'Potassium req (kg/ha)' },
  ];

  let trendChart = null;
  let radarChart = null;

  async function getJSON(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `${url} failed`);
    return data;
  }

  function renderMetrics(a, b) {
    metricsEl.innerHTML = METRICS.map((m) => {
      const va = a[m.key];
      const vb = b[m.key];
      const aWins = m.highlightWinner && va > vb;
      const bWins = m.highlightWinner && vb > va;
      return `
        <div class="card compare-metric-card">
          <div class="compare-metric-label">${m.label}</div>
          <div class="compare-metric-row">
            <div class="compare-metric-val ${aWins ? 'winner' : ''}">
              <span class="crop-tag">${a.crop_label}</span>${va}
            </div>
            <div class="compare-metric-val ${bWins ? 'winner' : ''}" style="text-align:right;">
              <span class="crop-tag">${b.crop_label}</span>${vb}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderLists(a, b) {
    document.getElementById('topStatesLabelA').textContent = `Top states — ${a.crop_label}`;
    document.getElementById('topStatesLabelB').textContent = `Top states — ${b.crop_label}`;
    document.getElementById('topDistrictsLabelA').textContent = `Top districts — ${a.crop_label}`;
    document.getElementById('topDistrictsLabelB').textContent = `Top districts — ${b.crop_label}`;

    const listHTML = (items, nameKey) => items.map((it) => `
      <li><span class="name">${it[nameKey]}</span><span class="val">${it.avg_yield} kg/ha</span></li>
    `).join('') || '<li><span class="name">No data</span></li>';

    document.getElementById('topStatesA').innerHTML = listHTML(a.top_states, 'state_name');
    document.getElementById('topStatesB').innerHTML = listHTML(b.top_states, 'state_name');
    document.getElementById('topDistrictsA').innerHTML = listHTML(a.top_districts, 'dist_name');
    document.getElementById('topDistrictsB').innerHTML = listHTML(b.top_districts, 'dist_name');
  }

  function renderTrendChart(a, b) {
    const ctx = document.getElementById('compareTrendChart');
    const config = {
      type: 'line',
      data: {
        labels: a.yield_trend.labels,
        datasets: [
          { label: a.crop_label, data: a.yield_trend.data, borderColor: COLOR.primary, backgroundColor: 'transparent', tension: 0.35, pointRadius: 0 },
          { label: b.crop_label, data: b.yield_trend.data, borderColor: COLOR.accent, backgroundColor: 'transparent', tension: 0.35, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10 } } },
        scales: {
          x: { grid: { color: COLOR.grid }, ticks: { color: COLOR.text, maxTicksLimit: 10 }, border: { display: false } },
          y: { grid: { color: COLOR.grid }, ticks: { color: COLOR.text }, border: { display: false } },
        },
      },
    };
    if (trendChart) { trendChart.data = config.data; trendChart.update(); }
    else trendChart = new Chart(ctx, config);
  }

  async function renderRadarChart(cropA, cropB) {
    const [na, nb] = await Promise.all([
      getJSON(`/api/charts/npk?crop=${cropA}`),
      getJSON(`/api/charts/npk?crop=${cropB}`),
    ]);
    const ctx = document.getElementById('compareRadarChart');
    const config = {
      type: 'radar',
      data: {
        labels: na.labels,
        datasets: [
          { label: cropA[0].toUpperCase() + cropA.slice(1), data: na.data, borderColor: COLOR.primary, backgroundColor: 'rgba(34,197,94,0.12)', pointBackgroundColor: COLOR.primary },
          { label: cropB[0].toUpperCase() + cropB.slice(1), data: nb.data, borderColor: COLOR.accent, backgroundColor: 'rgba(59,130,246,0.12)', pointBackgroundColor: COLOR.accent },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10 } } },
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
    };
    if (radarChart) { radarChart.data = config.data; radarChart.update(); }
    else radarChart = new Chart(ctx, config);
  }

  async function refresh() {
    const cropA = cropASel.value;
    const cropB = cropBSel.value;
    errorEl.classList.remove('show');

    if (cropA === cropB) {
      errorEl.textContent = 'Pick two different crops to compare.';
      errorEl.classList.add('show');
      return;
    }

    try {
      const data = await getJSON(`/api/compare?crop_a=${cropA}&crop_b=${cropB}`);
      renderMetrics(data.crop_a, data.crop_b);
      renderLists(data.crop_a, data.crop_b);
      renderTrendChart(data.crop_a, data.crop_b);
      await renderRadarChart(cropA, cropB);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add('show');
    }
  }

  cropASel.addEventListener('change', refresh);
  cropBSel.addEventListener('change', refresh);
  refresh();
})();
