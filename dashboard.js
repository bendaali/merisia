const grid = document.getElementById('designGrid');
const folderList = document.getElementById('folderList');
const searchInput = document.getElementById('searchInput');
const newDesignBtn = document.getElementById('newDesignBtn');
const newDesignModal = document.getElementById('newDesignModal');
const closeDesignModal = document.getElementById('closeDesignModal');
const newDesignForm = document.getElementById('newDesignForm');
const newDesignName = document.getElementById('newDesignName');
const newDesignFolder = document.getElementById('newDesignFolder');
const allCount = document.getElementById('allCount');
const logoutBtn = document.getElementById('logoutBtn');
const sidebar = document.getElementById('folders');
const sidebarToggle = document.getElementById('sidebarToggle');
const designsNav = document.getElementById('designsNav');
const archiveNav = document.getElementById('archiveNav');
const newFolderBtn = document.getElementById('newFolderBtn');

let selectedFolder = '';
let folders = [];
let archiveMode = location.hash === '#archive';
let dashboardContextMenu = null;

const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const folderPalette = ['#2f6fbd', '#2d8f74', '#b8762b', '#8b5cf6', '#db2777', '#0d9488', '#dc2626'];

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    location.href = '/auth';
    throw new Error('Authentification requise');
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function closeDashboardContextMenu() {
  dashboardContextMenu?.remove();
  dashboardContextMenu = null;
}

function openDashboardModal({ title, message = '', fields = [], submitLabel = 'Valider', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'design-modal open dashboard-dialog';
    overlay.innerHTML = `
      <form class="design-modal-card dashboard-dialog-card">
        <button class="modal-close" type="button" data-dialog-cancel aria-label="Fermer">×</button>
        <p class="section-kicker">${danger ? 'Attention' : 'Action'}</p>
        <h2>${escapeHtml(title)}</h2>
        ${message ? `<p class="dialog-copy">${escapeHtml(message)}</p>` : ''}
        ${fields.map((field) => {
          if (field.type === 'select') {
            return `<label>${escapeHtml(field.label)}
              <select name="${escapeHtml(field.name)}">
                ${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(field.value ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
              </select>
            </label>`;
          }
          return `<label>${escapeHtml(field.label)}
            <input name="${escapeHtml(field.name)}" type="${field.type || 'text'}" value="${escapeHtml(field.value ?? '')}" ${field.required ? 'required' : ''} />
          </label>`;
        }).join('')}
        <div class="dialog-actions">
          <button class="secondary-btn" type="button" data-dialog-cancel>Annuler</button>
          <button class="primary-btn auth-submit ${danger ? 'danger' : ''}" type="submit">${escapeHtml(submitLabel)}</button>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    const close = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelectorAll('[data-dialog-cancel]').forEach((button) => {
      button.addEventListener('click', () => close(null));
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      close(Object.fromEntries(new FormData(form)));
    });
    form.querySelector('input, select, button[type="submit"]')?.focus();
  });
}

function openDashboardContextMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  closeDashboardContextMenu();

  dashboardContextMenu = document.createElement('div');
  dashboardContextMenu.className = 'dashboard-context-menu';
  dashboardContextMenu.style.left = `${event.clientX}px`;
  dashboardContextMenu.style.top = `${event.clientY}px`;
  dashboardContextMenu.innerHTML = items.map((item, index) => (
    `<button type="button" data-menu-index="${index}" class="${item.danger ? 'danger' : ''}">${escapeHtml(item.label)}</button>`
  )).join('');
  dashboardContextMenu.addEventListener('click', async (clickEvent) => {
    const button = clickEvent.target.closest('[data-menu-index]');
    if (!button) return;
    const item = items[Number(button.dataset.menuIndex)];
    closeDashboardContextMenu();
    await item.run();
  });
  document.body.appendChild(dashboardContextMenu);
}

function visibleFolders() {
  return folders.filter((folder) => String(folder.name).toLowerCase() !== 'archives');
}

async function loadFolders() {
  folders = await fetchJson('/api/folders');
  const shownFolders = visibleFolders();
  folderList.innerHTML = shownFolders.map((folder) => `
    <button class="folder-item" data-folder="${Number(folder.id)}">
      <span class="folder-dot" style="--dot:${escapeHtml(folder.color)}"></span>
      <span class="folder-name">${escapeHtml(folder.name)}</span>
      <small>${Number(folder.count)}</small>
    </button>
  `).join('');

  newDesignFolder.innerHTML = shownFolders.map((folder) => (
    `<option value="${Number(folder.id)}">${escapeHtml(folder.name)}</option>`
  )).join('');
  allCount.textContent = folders[0]?.all_count ?? shownFolders.reduce((sum, folder) => sum + Number(folder.count), 0);

  document.querySelectorAll('.folder-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedFolder = btn.dataset.folder || '';
      document.querySelectorAll('.folder-item').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      loadDesigns();
    });

    btn.addEventListener('contextmenu', (event) => {
      const id = btn.dataset.folder;
      if (!id) return;
      const folder = shownFolders.find((item) => String(item.id) === String(id));
      if (!folder) return;
      openDashboardContextMenu(event, [
        { label: 'Renommer', run: () => renameFolder(id, folder.name) },
        { label: 'Changer la couleur', run: () => recolorFolder(id, folder.color) },
        { label: 'Supprimer', danger: true, run: () => deleteFolder(id) },
      ]);
    });
  });
}

async function renameFolder(id, currentName) {
  const result = await openDashboardModal({
    title: 'Renommer le groupe',
    fields: [{ name: 'name', label: 'Nom du groupe', value: currentName || '', required: true }],
    submitLabel: 'Renommer'
  });
  const name = result?.name;
  if (!name?.trim()) return;
  await fetchJson(`/api/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() })
  });
  await loadFolders();
  await loadDesigns();
}

async function recolorFolder(id, currentColor) {
  const result = await openDashboardModal({
    title: 'Couleur du groupe',
    fields: [{ name: 'color', label: 'Couleur', type: 'color', value: currentColor || '#2f6fbd' }],
    submitLabel: 'Appliquer'
  });
  const color = result?.color;
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
  await fetchJson(`/api/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color })
  });
  await loadFolders();
}

async function deleteFolder(id) {
  const result = await openDashboardModal({
    title: 'Supprimer ce groupe',
    message: 'Les designs resteront disponibles sans dossier.',
    submitLabel: 'Supprimer',
    danger: true
  });
  if (!result) return;
  await fetchJson(`/api/folders/${id}`, { method: 'DELETE' });
  if (selectedFolder === id) selectedFolder = '';
  await loadFolders();
  await loadDesigns();
}

async function loadDesigns() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (selectedFolder && !archiveMode) params.set('folder', selectedFolder);
  if (archiveMode) params.set('archived', 'true');
  const designs = await fetchJson(`/api/designs?${params}`);
  if (!designs.length) {
    grid.innerHTML = `<div class="empty-state">${archiveMode ? 'Aucun design archive.' : 'Aucun design trouve. Clique sur <strong>+ Nouveau design</strong> pour commencer.'}</div>`;
    return;
  }
  grid.innerHTML = designs.map((design) => `
    <article class="design-row" data-open="/editor/${escapeHtml(design.id)}" data-id="${escapeHtml(design.id)}" data-title="${escapeHtml(design.title)}">
      <div class="row-preview">
        <span class="mini-node a"></span><span class="mini-node b"></span><span class="mini-node c"></span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M24 55 C38 45, 48 34, 59 29" />
          <path d="M82 67 C75 52, 68 37, 59 29" />
        </svg>
      </div>
      <div class="row-main">
        <div class="row-titleline">
          <h3>${escapeHtml(design.title)}</h3>
          <span class="kind">${escapeHtml(design.kind)}</span>
          <span class="status">${escapeHtml(design.status)}</span>
          <span class="ownership ${design.access_role === 'owner' ? 'owned' : 'shared'}">${escapeHtml(design.access_role === 'owner' ? 'Propriétaire' : `Partagé · ${design.access_role === 'editor' ? 'éditeur' : 'lecteur'}`)}</span>
        </div>
        <p><span class="folder-dot" style="--dot:${escapeHtml(design.folder_color || '#2f6fbd')}"></span>${escapeHtml(design.folder || 'Sans dossier')} - Modifie le ${fmt.format(new Date(design.updated_at))}</p>
      </div>
      <div class="row-actions">
        <button class="dots-btn" aria-label="Actions pour ${escapeHtml(design.title)}">...</button>
        <div class="actions-menu">
          <button type="button" data-action="rename" data-id="${escapeHtml(design.id)}" data-title="${escapeHtml(design.title)}">Renommer</button>
          <button type="button" data-action="move" data-id="${escapeHtml(design.id)}">Changer de groupe</button>
          <button type="button" data-action="archive" data-id="${escapeHtml(design.id)}">${archiveMode ? 'Restaurer' : 'Archiver'}</button>
          <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(design.id)}">Supprimer</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function renameDesign(id, currentTitle) {
  const result = await openDashboardModal({
    title: 'Renommer le design',
    fields: [{ name: 'title', label: 'Nom du design', value: currentTitle || '', required: true }],
    submitLabel: 'Renommer'
  });
  const title = result?.title;
  if (!title?.trim()) return;
  await fetchJson(`/api/designs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim() })
  });
  await loadDesigns();
}

async function moveDesignToFolder(id) {
  const shownFolders = visibleFolders();
  const result = await openDashboardModal({
    title: 'Changer de groupe',
    fields: [{
      name: 'folder_id',
      label: 'Groupe',
      type: 'select',
      value: '',
      options: [
        { value: '', label: 'Sans dossier' },
        ...shownFolders.map((folder) => ({ value: folder.id, label: folder.name }))
      ]
    }],
    submitLabel: 'Déplacer'
  });
  if (!result) return;
  const folderId = result.folder_id || null;
  await fetchJson(`/api/designs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: folderId })
  });
  await loadFolders();
  await loadDesigns();
}

async function archiveDesign(id) {
  await fetchJson(`/api/designs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: archiveMode ? 'Brouillon' : 'Archive' })
  });
  await loadFolders();
  await loadDesigns();
}

async function deleteDesign(id) {
  const result = await openDashboardModal({
    title: 'Supprimer ce design',
    message: 'Cette action est irreversible.',
    submitLabel: 'Supprimer',
    danger: true
  });
  if (!result) return;
  await fetchJson(`/api/designs/${id}`, { method: 'DELETE' });
  await loadFolders();
  await loadDesigns();
}

function designMenuItems(id, title) {
  return [
    { label: 'Renommer', run: () => renameDesign(id, title) },
    { label: 'Changer de groupe', run: () => moveDesignToFolder(id) },
    { label: archiveMode ? 'Restaurer' : 'Archiver', run: () => archiveDesign(id) },
    { label: 'Supprimer', danger: true, run: () => deleteDesign(id) },
  ];
}

grid.addEventListener('contextmenu', (event) => {
  const row = event.target.closest('.design-row');
  if (!row) return;
  openDashboardContextMenu(event, designMenuItems(row.dataset.id, row.dataset.title || ''));
});

grid.addEventListener('click', async (event) => {
  const dots = event.target.closest('.dots-btn');
  if (dots) {
    const row = dots.closest('.design-row');
    document.querySelectorAll('.design-row.menu-open').forEach((open) => {
      if (open !== row) open.classList.remove('menu-open');
    });
    row.classList.toggle('menu-open');
    return;
  }

  const action = event.target.closest('[data-action]');
  const row = event.target.closest('.design-row');
  const rowOpen = row?.dataset.open;
  if (!action && rowOpen && !event.target.closest('.row-actions')) {
    location.href = rowOpen;
    return;
  }
  if (!action) return;

  const id = action.dataset.id;
  if (action.dataset.action === 'rename') await renameDesign(id, action.dataset.title || '');
  if (action.dataset.action === 'move') await moveDesignToFolder(id);
  if (action.dataset.action === 'archive') await archiveDesign(id);
  if (action.dataset.action === 'delete') await deleteDesign(id);
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.dashboard-context-menu')) closeDashboardContextMenu();
  if (!event.target.closest('.row-actions')) {
    document.querySelectorAll('.design-row.menu-open').forEach((row) => row.classList.remove('menu-open'));
  }
});

searchInput.addEventListener('input', () => loadDesigns());

function openNewDesignModal() {
  newDesignModal.classList.add('open');
  newDesignModal.setAttribute('aria-hidden', 'false');
  newDesignName.value = '';
  newDesignFolder.value = selectedFolder || (visibleFolders()[0] && String(visibleFolders()[0].id)) || '';
  setTimeout(() => newDesignName.focus(), 50);
}

function closeModal() {
  newDesignModal.classList.remove('open');
  newDesignModal.setAttribute('aria-hidden', 'true');
}

newDesignBtn.addEventListener('click', openNewDesignModal);
closeDesignModal.addEventListener('click', closeModal);
newDesignModal.addEventListener('click', (event) => {
  if (event.target === newDesignModal) closeModal();
});

newDesignForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const created = await fetchJson('/api/designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: newDesignName.value.trim() || 'Nouveau design Merise',
      folder_id: newDesignFolder.value || null
    })
  });
  location.href = `/editor/${created.id}`;
});

logoutBtn?.addEventListener('click', async () => {
  await fetchJson('/api/auth/logout', { method: 'POST' });
  location.href = '/auth';
});

function setArchiveMode(value) {
  archiveMode = value;
  selectedFolder = '';
  document.querySelectorAll('.folder-item').forEach((x) => x.classList.remove('active'));
  document.querySelector('.folder-item[data-folder=""]')?.classList.add('active');
  designsNav.classList.toggle('active', !archiveMode);
  archiveNav.classList.toggle('active', archiveMode);
  newDesignBtn.disabled = archiveMode;
  newDesignBtn.style.opacity = archiveMode ? '0.45' : '1';
  loadDesigns();
}

designsNav?.addEventListener('click', (event) => {
  event.preventDefault();
  history.replaceState(null, '', '/dashboard');
  setArchiveMode(false);
});

archiveNav?.addEventListener('click', (event) => {
  event.preventDefault();
  history.replaceState(null, '', '#archive');
  setArchiveMode(true);
});

function syncSidebarToggle() {
  if (!sidebar || !sidebarToggle) return;
  const collapsed = sidebar.classList.contains('collapsed');
  sidebarToggle.textContent = collapsed ? '>' : '<';
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Afficher les dossiers' : 'Reduire les dossiers');
}

sidebarToggle?.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  syncSidebarToggle();
});

newFolderBtn?.addEventListener('click', async () => {
  const color = folderPalette[folders.length % folderPalette.length];
  const result = await openDashboardModal({
    title: 'Nouveau groupe',
    fields: [
      { name: 'name', label: 'Nom du groupe', required: true },
      { name: 'color', label: 'Couleur', type: 'color', value: color }
    ],
    submitLabel: 'Créer'
  });
  const name = result?.name;
  if (!name?.trim()) return;
  await fetchJson('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), color: result.color || color })
  });
  await loadFolders();
});

loadFolders().then(() => setArchiveMode(archiveMode)).catch((err) => {
  grid.innerHTML = `<div class="empty-state">Erreur dashboard: ${escapeHtml(err.message)}</div>`;
});
