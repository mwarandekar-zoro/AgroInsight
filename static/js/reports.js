// AgroInsight AI — reports page

(function () {
  const yearMS = document.getElementById('filterYear');
  if (!yearMS) return;

  const filterMS = {
    year:     new MultiSelect(yearMS, 'All years', () => refreshPreview()),
    crop:     new MultiSelect(document.getElementById('filterCrop'),     'All crops',     () => refreshPreview()),
    state:    new MultiSelect(document.getElementById('filterState'),    'All states',    async () => { await refreshDistricts(); refreshPreview(); }),
    district: new MultiSelect(document.getElementById('filterDistrict'), 'All districts', () => refreshPreview()),
  };

  const resetBtn = document.getElementById('resetFilters');

  const csvLink = document.getElementById('exportCsv');
  const excelLink = document.getElementById('exportExcel');
  const pdfLink = document.getElementById('exportPdf');

  function currentFilters() {
    return {
      year:     filterMS.year.getValues().join(','),
      crop:     filterMS.crop.getValues().join(','),
      state:    filterMS.state.getValues().join(','),
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

  async function refreshDistricts() {
    const state = filterMS.state.getValues().join(',');
    const list  = await getJSON(`/api/districts?${qs({ state })}`);
    filterMS.district.setOptions(list);
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

  resetBtn.addEventListener('click', async () => {
    filterMS.year.clear();
    filterMS.crop.clear();
    filterMS.state.clear();
    await refreshDistricts();
    filterMS.district.clear();
    refreshPreview();
  });

  refreshDistricts().then(refreshPreview);
})();
