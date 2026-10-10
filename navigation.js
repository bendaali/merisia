document.querySelectorAll('.menu-toggle').forEach((toggle) => {
  const header = toggle.closest('.topbar');
  const menu = document.getElementById(toggle.getAttribute('aria-controls'));
  if (!header || !menu) return;

  const closeMenu = () => {
    header.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
  };

  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  });

  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('click', (event) => {
    if (!header.contains(event.target)) closeMenu();
  });
});
