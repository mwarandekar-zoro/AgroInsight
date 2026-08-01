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

  // Theme toggle (dashboard topbar) — stored in-memory only, no localStorage
  const themeBtn = document.querySelector('.icon-btn[title="Toggle theme"]');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      document.documentElement.classList.toggle('light-theme');
      themeBtn.textContent = document.documentElement.classList.contains('light-theme') ? '☀️' : '🌙';
    });
  }
});
