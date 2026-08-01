// AgriInsight AI — crop recommendation form

(function () {
  const form = document.getElementById('recForm');
  if (!form) return;

  const submitBtn = document.getElementById('recSubmit');
  const errorEl = document.getElementById('recError');
  const emptyEl = document.getElementById('recEmpty');
  const resultEl = document.getElementById('recResult');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.remove('show');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Analyzing…';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      renderResult(data);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Recommend a crop';
    }
  });

  function renderResult(data) {
    emptyEl.style.display = 'none';
    resultEl.style.display = 'block';

    document.getElementById('resCrop').textContent = data.crop_label;
    document.getElementById('resConfidence').textContent = `${data.confidence}%`;
    document.getElementById('resYield').textContent = `${data.expected_yield.toLocaleString()} kg/ha`;
    document.getElementById('resState').textContent = data.best_state || '–';
    document.getElementById('resDistrict').textContent = data.best_district || '–';

    const explEl = document.getElementById('resExplanation');
    explEl.innerHTML = data.explanation.map((c) => `
      <li class="${c.matched ? 'matched' : 'unmatched'}">
        <span class="ec-icon">${c.matched ? '✔' : '○'}</span>
        <span>
          <span class="ec-label">${c.label}</span>
          <span class="ec-detail">${c.detail}</span>
        </span>
      </li>
    `).join('');

    const probsEl = document.getElementById('resProbs');
    const sorted = Object.entries(data.all_probabilities).sort((a, b) => b[1] - a[1]);
    probsEl.innerHTML = sorted.map(([crop, pct]) => `
      <div class="rec-prob-row">
        <span class="name">${crop}</span>
        <span class="bar-wrap"><span class="bar" style="width:${pct}%"></span></span>
        <span class="pct">${pct}%</span>
      </div>
    `).join('');
    // animate bars in after paint
    requestAnimationFrame(() => {
      probsEl.querySelectorAll('.bar').forEach((el) => { el.style.width = el.style.width; });
    });
  }
})();
