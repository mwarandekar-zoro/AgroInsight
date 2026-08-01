// AgriInsight AI — shared front-end behaviour

document.addEventListener('DOMContentLoaded', () => {
  // Reveal feature cards / insight cards as they scroll into view
  const revealTargets = document.querySelectorAll('.feature-card, .insight-card');
  if (revealTargets.length && 'IntersectionObserver' in window) {
    revealTargets.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(14px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach((el) => io.observe(el));
  }

  // Theme toggle (dashboard topbar) — persisted so it survives page loads,
  // since this is a real multi-page app, not a single-page artifact.
  const themeBtn = document.querySelector('.icon-btn[title="Toggle theme"]');
  if (themeBtn) {
    const isLight = document.documentElement.classList.contains('light-theme');
    themeBtn.textContent = isLight ? '☀️' : '🌙';

    themeBtn.addEventListener('click', () => {
      const nowLight = !document.documentElement.classList.contains('light-theme');
      try {
        localStorage.setItem('agriinsight-theme', nowLight ? 'light' : 'dark');
      } catch (e) { /* localStorage unavailable — theme just won't persist */ }
      // Reload rather than toggle in place: Chart.js reads CSS variables
      // once at chart creation time, so any charts on the page would stay
      // the wrong color until reload anyway. This keeps every element —
      // charts included — consistently themed with zero extra wiring.
      window.location.reload();
    });
  }
});
