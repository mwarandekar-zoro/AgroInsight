// AgriInsight AI — reports page

(function () {
  const yearSel = document.getElementById('filterYear');
  if (!yearSel) return;

  const cropSel = document.getElementById('filterCrop');
  const stateSel = document.getElementById('filterState');
  const districtSel = document.getElementById('filterDistrict');
  const resetBtn = document.getElementById('resetFilters');

  const csvLink = document.getElementById('exportCsv');
  const excelLink = document.getElementById('exportExcel');
  const pdfLink = document.getElementById('exportPdf');

  function currentFilters() {
    return { year: yearSel.value, crop: cropSel.value, state: stateSel.value, district: districtSel.value };
  }

  function qs(params) {
    return new URLSearchParams(params).toString();
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  async function refreshDistricts() {
    const state = stateSel.value;
    const list = await getJSON(`/api/districts?${qs({ state })}`);
    const current = districtSel.value;
    districtSel.innerHTML = '<option value="all">All districts</option>' +
      list.map((d) => `<option value="${d}">${d}</option>`).join('');
    if (list.includes(current)) districtSel.value = current;
  }

  async function refreshPreview() {
    const f = currentFilters();
    const data = await getJSON(`/api/kpis?${qs(f)}`);
    document.getElementById('repRecords').textContent = data.record_count.toLocaleString();
    document.getElementById('repYield').textContent = data.avg_yield != null ? data.avg_yield.toLocaleString() : '–';
    document.getElementById('repStates').textContent = data.state_count ?? '–';
    document.getElementById('repRain').textContent = data.avg_rainfall ?? '–';

    const query = qs(f);
    csvLink.href = `/reports/export/csv?${query}`;
    excelLink.href = `/reports/export/excel?${query}`;
    pdfLink.href = `/reports/export/pdf?${query}`;
  }

  yearSel.addEventListener('change', refreshPreview);
  cropSel.addEventListener('change', refreshPreview);
  districtSel.addEventListener('change', refreshPreview);
  stateSel.addEventListener('change', async () => {
    await refreshDistricts();
    refreshPreview();
  });
  resetBtn.addEventListener('click', async () => {
    yearSel.value = 'all';
    cropSel.value = 'all';
    stateSel.value = 'all';
    await refreshDistricts();
    districtSel.value = 'all';
    refreshPreview();
  });

  refreshDistricts().then(refreshPreview);
})();
