// AgroInsight AI — multi-select filter widget
//
// Turns a container like:
//   <div class="multiselect" data-key="crop">
//     <button type="button" class="ms-trigger">...</button>
//     <div class="ms-panel">
//       <input class="ms-search" type="text" placeholder="Search…">
//       <div class="ms-actions">
//         <button type="button" data-action="all">All</button>
//         <button type="button" data-action="clear">Clear</button>
//       </div>
//       <div class="ms-options">
//         <label class="ms-option"><input type="checkbox" value="rice"> Rice</label>
//         ...
//       </div>
//     </div>
//   </div>
// into a working multi-select, without any framework. One instance per
// filter (year/crop/state/district). Selecting nothing = "all" (no
// filter applied) — there's no separate "All" checkbox to manage.

class MultiSelect {
  /**
   * @param {HTMLElement} root - the .multiselect container
   * @param {string} allLabel - trigger text when nothing is selected, e.g. "All years"
   * @param {(values: string[]) => void} onChange - called with selected values (lowercased comparisons are the caller's job)
   */
  constructor(root, allLabel, onChange) {
    this.root = root;
    this.allLabel = allLabel;
    this.onChange = onChange || (() => {});
    this.trigger = root.querySelector('.ms-trigger');
    this.panel = root.querySelector('.ms-panel');
    this.optionsEl = root.querySelector('.ms-options');
    this.searchEl = root.querySelector('.ms-search');

    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePanel();
    });

    this.panel.addEventListener('click', (e) => {
      const action = e.target.dataset && e.target.dataset.action;
      if (action === 'all') {
        this._setAllChecked(true);
        this._notify();
      } else if (action === 'clear') {
        this._setAllChecked(false);
        this._notify();
      }
    });

    this.optionsEl.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"]')) this._notify();
    });

    if (this.searchEl) {
      this.searchEl.addEventListener('input', () => this._applySearch());
    }

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) this._closePanel();
    });

    this._updateTriggerLabel();
  }

  _togglePanel() {
    const isOpen = this.panel.classList.contains('open');
    // close any other open panel first (simple single-open-at-a-time UX)
    document.querySelectorAll('.ms-panel.open').forEach((p) => p.classList.remove('open'));
    if (!isOpen) this.panel.classList.add('open');
  }

  _closePanel() {
    this.panel.classList.remove('open');
  }

  _checkboxes() {
    return Array.from(this.optionsEl.querySelectorAll('input[type="checkbox"]'));
  }

  _setAllChecked(state) {
    this._checkboxes().forEach((cb) => { cb.checked = state; });
  }

  _applySearch() {
    const q = this.searchEl.value.trim().toLowerCase();
    this.optionsEl.querySelectorAll('.ms-option').forEach((label) => {
      const text = label.textContent.trim().toLowerCase();
      label.style.display = !q || text.includes(q) ? '' : 'none';
    });
  }

  _notify() {
    this._updateTriggerLabel();
    this.onChange(this.getValues());
  }

  _updateTriggerLabel() {
    const values = this.getValues();
    let text;
    if (values.length === 0) text = this.allLabel;
    else if (values.length === 1) text = this._labelFor(values[0]);
    else text = `${values.length} selected`;
    this.trigger.querySelector('.ms-trigger-text').textContent = text;
    this.root.classList.toggle('active', values.length > 0);
  }

  _labelFor(value) {
    const cb = this._checkboxes().find((c) => c.value === value);
    if (!cb) return value;
    return cb.closest('.ms-option').textContent.trim();
  }

  /** Selected values, lowercase-free (exactly as the checkbox "value" attrs are) — [] means "all". */
  getValues() {
    return this._checkboxes().filter((cb) => cb.checked).map((cb) => cb.value);
  }

  /** Programmatically select exactly these values (used for reset / URL prefill). */
  setValues(values) {
    const set = new Set(values.map(String));
    this._checkboxes().forEach((cb) => { cb.checked = set.has(cb.value); });
    this._updateTriggerLabel();
  }

  clear() {
    this._setAllChecked(false);
    this._updateTriggerLabel();
  }

  /** Rebuild the option list entirely (used for the district list, which depends on the state filter). */
  setOptions(values) {
    const previouslySelected = new Set(this.getValues());
    this.optionsEl.innerHTML = values.map((v) => `
      <label class="ms-option">
        <input type="checkbox" value="${v}" ${previouslySelected.has(v) ? 'checked' : ''}>
        ${v}
      </label>
    `).join('');
    this._updateTriggerLabel();
  }
}

window.MultiSelect = MultiSelect;
