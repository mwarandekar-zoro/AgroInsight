// AgroInsight AI — Interactive India Map
// Choropleth of the 20 dataset states colored by average yield (live from
// /api/map/states). Clicking a covered state jumps into the dashboard
// pre-filtered to it (?state=...), reusing the same URL-param filtering
// dashboard.html/charts.js already support for the AI Assistant redirects.

(function () {
  const mapEl = document.getElementById('indiaMap');
  if (!mapEl) return;

  // The vendored geojson (source: GADM via geohacker/india, simplified)
  // uses a couple of older state names that don't match the dataset's
  // spelling. Map dataset-name -> geojson-name so lookups line up.
  const DATASET_TO_GEOJSON = {
    'Orissa': 'Odisha',
  };
  function geojsonNameFor(datasetName) {
    return DATASET_TO_GEOJSON[datasetName] || datasetName;
  }

  const css = getComputedStyle(document.documentElement);
  const borderColor = css.getPropertyValue('--border-strong').trim() || '#3D4C61';
  const noDataFill = css.getPropertyValue('--border').trim() || '#2D3748';

  const sideTitle = document.getElementById('mapSideTitle');
  const sideBody = document.getElementById('mapSideBody');
  const uncoveredNote = document.getElementById('mapUncoveredNote');

  const map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: false,
    minZoom: 4,
    maxZoom: 7,
    scrollWheelZoom: false,
  }).setView([22.6, 80.5], 4.6);

  L.control.attribution({ prefix: false }).addAttribution('State boundaries: GADM').addTo(map);

  // 3-stop green ramp (dark -> primary -> light) matching the legend bar
  const RAMP = [
    { stop: 0,   color: [22, 50, 31] },   // #16321F
    { stop: 0.5, color: [30, 86, 49] },   // #1E5631
    { stop: 0.85, color: [34, 197, 94] }, // #22C55E (--primary)
    { stop: 1,   color: [110, 231, 168] }, // #6EE7A8
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function colorFor(t) {
    t = Math.max(0, Math.min(1, t));
    let lo = RAMP[0], hi = RAMP[RAMP.length - 1];
    for (let i = 0; i < RAMP.length - 1; i++) {
      if (t >= RAMP[i].stop && t <= RAMP[i + 1].stop) { lo = RAMP[i]; hi = RAMP[i + 1]; break; }
    }
    const span = hi.stop - lo.stop || 1;
    const localT = (t - lo.stop) / span;
    const rgb = lo.color.map((c, i) => Math.round(lerp(c, hi.color[i], localT)));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  function renderSidePanel(entry) {
    sideTitle.textContent = entry.state;
    sideBody.innerHTML = `
      <div class="map-stat-row"><span class="label">Avg yield</span><span class="value">${entry.avg_yield != null ? entry.avg_yield.toLocaleString() + ' kg/ha' : '–'}</span></div>
      <div class="map-stat-row"><span class="label">Top crop</span><span class="value">${entry.top_crop || '–'}</span></div>
      <div class="map-stat-row"><span class="label">Avg rainfall</span><span class="value">${entry.avg_rainfall != null ? entry.avg_rainfall + ' mm' : '–'}</span></div>
      <div class="map-stat-row"><span class="label">Avg soil pH</span><span class="value">${entry.avg_ph ?? '–'}</span></div>
      <div class="map-stat-row"><span class="label">Records</span><span class="value">${entry.record_count.toLocaleString()}</span></div>
      <button type="button" class="btn btn-primary btn-sm map-side-cta" id="mapSideCta">Open dashboard for ${entry.state} →</button>`;
    document.getElementById('mapSideCta').addEventListener('click', () => goToState(entry.state));
  }

  function goToState(stateName) {
    window.location.href = `/dashboard?state=${encodeURIComponent(stateName)}`;
  }

  Promise.all([
    fetch('/static/data/india_states.geojson').then((r) => r.json()),
    fetch('/api/map/states').then((r) => r.json()),
  ]).then(([geojson, statesResp]) => {
    const byState = {};
    statesResp.states.forEach((s) => { byState[geojsonNameFor(s.state)] = s; });

    const yields = statesResp.states.map((s) => s.avg_yield).filter((v) => v != null);
    const minY = Math.min(...yields);
    const maxY = Math.max(...yields);

    let anyCovered = false;
    let anyUncovered = false;

    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const name = feature.properties.name;
        const entry = byState[name];
        if (!entry) {
          anyUncovered = true;
          return { fillColor: noDataFill, fillOpacity: 0.35, color: borderColor, weight: 1 };
        }
        anyCovered = true;
        const t = maxY > minY ? (entry.avg_yield - minY) / (maxY - minY) : 0.5;
        return { fillColor: colorFor(t), fillOpacity: 0.82, color: borderColor, weight: 1 };
      },
      onEachFeature: (feature, lyr) => {
        const name = feature.properties.name;
        const entry = byState[name];
        lyr.on('add', () => {
          const path = lyr.getElement();
          if (path) {
            path.classList.add('state-shape');
            if (!entry) path.classList.add('no-data');
          }
        });

        if (entry) {
          lyr.bindTooltip(
            `<strong>${entry.state}</strong><br>${entry.avg_yield != null ? entry.avg_yield.toLocaleString() + ' kg/ha avg yield' : 'No yield data'}`,
            { sticky: true }
          );
          lyr.on('mouseover', () => { lyr.setStyle({ weight: 2 }); renderSidePanel(entry); });
          lyr.on('mouseout', () => { lyr.setStyle({ weight: 1 }); });
          lyr.on('click', () => goToState(entry.state));
        } else {
          lyr.bindTooltip(`<strong>${name}</strong><br>Not covered by this dataset`, { sticky: true });
        }
      },
    }).addTo(map);

    try { map.fitBounds(layer.getBounds(), { padding: [12, 12] }); } catch (e) { /* keep default view */ }

    uncoveredNote.hidden = !anyUncovered;

    // Enable scroll-zoom only once the map has focus, so scrolling the
    // page doesn't get hijacked the moment the map is in the viewport.
    mapEl.addEventListener('click', () => map.scrollWheelZoom.enable());
    document.addEventListener('click', (e) => {
      if (!mapEl.contains(e.target)) map.scrollWheelZoom.disable();
    });
  }).catch((err) => {
    console.error("India Map Error:", err);
    mapEl.innerHTML = `<div class="empty-note" style="padding:24px; color:var(--danger);">Map data is unavailable right now.<br><span style="font-size:11px; color:var(--text-muted);">${err.message || err}</span></div>`;
  });
})();
