// AgroInsight AI — Analyze Data page
// Uploads a user-provided CSV/Excel file to /api/analyze/upload and renders
// the returned profile (stats, preview rows, auto charts, correlation matrix).
// Nothing here talks to the crop_data dataset — this is entirely about
// whatever file the user just uploaded.

(function () {
  const dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const statusEl = document.getElementById('analyzeStatus');
  const resultsEl = document.getElementById('analyzeResults');
  const analyzeAnotherBtn = document.getElementById('analyzeAnother');

  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    primary: css.getPropertyValue('--primary').trim() || '#22C55E',
    accent: css.getPropertyValue('--accent').trim() || '#3B82F6',
    warning: css.getPropertyValue('--warning').trim() || '#F59E0B',
    text: css.getPropertyValue('--text-muted').trim() || '#94A3B8',
    grid: 'rgba(255,255,255,0.06)',
  };
  const PALETTE = [COLOR.primary, COLOR.accent, COLOR.warning, '#A855F7', '#EC4899', '#14B8A6'];

  let chartInstances = [];

  function setStatus(message, kind) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = 'analyze-status ' + (kind || '');
  }

  function resetView() {
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [];
    resultsEl.hidden = true;
    dropzone.hidden = false;
    setStatus('');
    fileInput.value = '';
  }

  async function uploadFile(file) {
    const allowed = ['csv', 'xlsx', 'xls'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowed.includes(ext)) {
      setStatus('Only .csv, .xlsx and .xls files are supported.', 'error');
      return;
    }

    setStatus(`Analyzing ${file.name} …`, 'loading');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/analyze/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Something went wrong analyzing that file.', 'error');
        return;
      }
      setStatus('');
      renderResults(data);
    } catch (err) {
      setStatus('Upload failed — check your connection and try again.', 'error');
    }
  }

  function renderResults(data) {
    dropzone.hidden = true;
    resultsEl.hidden = false;

    document.getElementById('resultFilename').textContent = data.filename;
    document.getElementById('statRows').textContent = data.row_count.toLocaleString();
    document.getElementById('statCols').textContent = data.column_count;
    document.getElementById('statNumeric').textContent = data.numeric_column_count;
    document.getElementById('statMissing').textContent = data.missing_pct + '%';

    renderColumnTable(data.columns);
    renderPreviewTable(data.preview_columns, data.preview_rows);
    renderAutoCharts(data.charts);
    renderCorrelation(data.correlation);
  }

  function renderColumnTable(columns) {
    const tbody = document.querySelector('#columnTable tbody');
    tbody.innerHTML = columns.map((col) => {
      let details = '–';
      if (col.kind === 'numeric') {
        details = `min ${fmt(col.min)} · max ${fmt(col.max)} · mean ${fmt(col.mean)} · std ${fmt(col.std)}`;
      } else if (col.kind === 'categorical' && col.top_values && col.top_values.length) {
        details = 'top: ' + col.top_values.slice(0, 3).map((t) => `${t.value} (${t.count})`).join(', ');
      } else if (col.kind === 'datetime') {
        details = `${col.min || '–'} → ${col.max || '–'}`;
      }
      return `<tr>
        <td class="col-name">${escapeHtml(col.name)}</td>
        <td><span class="type-pill type-${col.kind}">${col.dtype}</span></td>
        <td>${col.missing_count} (${col.missing_pct}%)</td>
        <td>${col.unique_count}</td>
        <td class="col-details">${escapeHtml(details)}</td>
      </tr>`;
    }).join('');
  }

  function renderPreviewTable(columns, rows) {
    const thead = document.querySelector('#previewTable thead');
    const tbody = document.querySelector('#previewTable tbody');
    thead.innerHTML = '<tr>' + columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
    tbody.innerHTML = rows.map((row) =>
      '<tr>' + columns.map((c) => `<td>${row[c] === null || row[c] === undefined ? '<span class="na">–</span>' : escapeHtml(String(row[c]))}</td>`).join('') + '</tr>'
    ).join('');
  }

  function renderAutoCharts(charts) {
    const grid = document.getElementById('autoChartGrid');
    grid.innerHTML = '';
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [];

    if (!charts.length) {
      grid.innerHTML = '<p class="empty-note">No numeric or low-cardinality columns to chart automatically.</p>';
      return;
    }

    charts.forEach((chart, i) => {
      const card = document.createElement('div');
      card.className = 'card chart-card';
      const title = chart.type === 'histogram' ? `Distribution — ${chart.column}` : `Top values — ${chart.column}`;
      card.innerHTML = `
        <div class="chart-card-head"><h3>${escapeHtml(title)}</h3></div>
        <div class="chart-wrap"><canvas id="autoChart${i}"></canvas></div>`;
      grid.appendChild(card);

      const ctx = card.querySelector('canvas').getContext('2d');
      const color = PALETTE[i % PALETTE.length];
      const instance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: chart.labels,
          datasets: [{
            label: chart.type === 'histogram' ? 'Count' : chart.column,
            data: chart.counts,
            backgroundColor: color,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: COLOR.text, maxRotation: 45, minRotation: 0 } },
            y: { grid: { color: COLOR.grid }, ticks: { color: COLOR.text }, beginAtZero: true },
          },
        },
      });
      chartInstances.push(instance);
    });
  }

  function renderCorrelation(corr) {
    const section = document.getElementById('correlationSection');
    const wrap = document.getElementById('correlationWrap');
    if (!corr.columns || corr.columns.length < 2) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    let html = '<table class="corr-table"><thead><tr><th></th>' +
      corr.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
    corr.matrix.forEach((row, i) => {
      html += `<tr><th>${escapeHtml(corr.columns[i])}</th>` +
        row.map((v) => `<td style="background:${corrColor(v)}">${v === null ? '–' : v}</td>`).join('') +
        '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function corrColor(v) {
    if (v === null) return 'transparent';
    const alpha = Math.min(Math.abs(v), 1) * 0.55;
    return v >= 0 ? `rgba(34, 197, 94, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
  }

  function fmt(n) {
    if (n === null || n === undefined) return '–';
    return typeof n === 'number' ? (Number.isInteger(n) ? n : n.toFixed(2)) : n;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // -- wiring --
  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target === browseBtn) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadFile(fileInput.files[0]);
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });

  analyzeAnotherBtn.addEventListener('click', resetView);
})();
