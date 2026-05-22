/* app.js — moon-ui v2 */

const cfg = window.APP_CONFIG || {};
const SUPABASE_URL      = cfg.SUPABASE_URL      || 'PASTE_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || 'PASTE_SUPABASE_ANON_KEY_HERE';

let db            = null;
let all           = [];      // movies
let allLinks      = {};      // { movie_id: [link, ...] }
let allSections   = [];      // sections from DB
let filt          = 'all';
let sectionFilt   = 'all';
let adminPassword = sessionStorage.getItem('movie_admin_password') || '';
let isAdmin       = adminPassword === 'Amonchand111';

/* ── Boot ── */
if (SUPABASE_URL.includes('PASTE_') || SUPABASE_ANON_KEY.includes('PASTE_')) {
  document.getElementById('loading').innerHTML =
    '<span class="state-icon">❌</span><span>Supabase config missing.</span>';
} else {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  init();
}

/* ── Init ── */
async function init() {
  try {
    await Promise.all([loadMovies(), loadSections(), loadLinks()]);
    document.getElementById('loading').style.display = 'none';
    renderSectionButtons();
    renderSectionSelect();
    updateAdminButton();
    render();
  } catch (e) {
    document.getElementById('loading').innerHTML =
      '<span class="state-icon">❌</span><span>Load nahi hua: ' + e.message + '</span>';
    console.error(e);
  }
}

/* ── Fetch ── */
async function loadMovies() {
  const { data, error } = await db
    .from('movies')
    .select('id,name,url,section,created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  all = (data || []).map(m => ({ ...m, section: m.section || 'Movies' }));
}

async function loadSections() {
  const { data, error } = await db
    .from('sections')
    .select('id,name,sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  allSections = data || [];
}

async function loadLinks() {
  const { data, error } = await db
    .from('movie_links')
    .select('id,movie_id,label,url,sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  allLinks = {};
  (data || []).forEach(lnk => {
    if (!allLinks[lnk.movie_id]) allLinks[lnk.movie_id] = [];
    allLinks[lnk.movie_id].push(lnk);
  });
}

/* ── Admin toggle ── */
function updateAdminButton() {
  const btn = document.getElementById('adminBtn');
  if (!btn) return;
  btn.textContent = isAdmin ? '🔓 Admin On' : '🔒 Admin';
  btn.classList.toggle('admin-on', isAdmin);
  // show/hide section manager button
  const smBtn = document.getElementById('sectionMgrBtn');
  if (smBtn) smBtn.style.display = isAdmin ? 'inline-flex' : 'none';
}

function toggleAdmin() {
  if (isAdmin) {
    adminPassword = '';
    isAdmin = false;
    sessionStorage.removeItem('movie_admin_password');
    updateAdminButton();
    render();
    toast('🔒 Admin off');
    return;
  }
  const pass = prompt('Admin password daalo:');
  if (pass === null) return;
  if (pass !== 'Amonchand111') return toast('❌ Wrong password', true);
  adminPassword = pass;
  isAdmin = true;
  sessionStorage.setItem('movie_admin_password', pass);
  updateAdminButton();
  render();
  toast('🔓 Admin unlocked');
}

/* ── Sections ── */
function getSections() {
  return allSections.map(s => s.name);
}

function renderSectionButtons() {
  const bar = document.getElementById('sectionBar');
  if (!bar) return;
  const sections = getSections();
  bar.innerHTML = [
    `<button class="sb active" data-section="all">All <span>${all.length}</span></button>`,
    ...sections.map(sec => {
      const count = all.filter(m => (m.section || 'Movies') === sec).length;
      if (!count) return '';
      return `<button class="sb" data-section="${esc(sec)}">${esc(sec)} <span>${count}</span></button>`;
    })
  ].join('');

  bar.querySelectorAll('.sb').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.sb').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      sectionFilt = btn.dataset.section || 'all';
      render();
    });
  });
}

function renderSectionSelect(selected) {
  const select = document.getElementById('newSection');
  if (!select) return;
  select.innerHTML = getSections().map(sec =>
    `<option value="${esc(sec)}">${esc(sec)}</option>`
  ).join('');
  select.value = selected || 'Movies';
}

/* ── Section Manager Modal ── */
function openSectionMgr() {
  if (!isAdmin) return toast('❌ Admin required', true);
  renderSectionMgrList();
  document.getElementById('sectionMgrOv').classList.add('open');
}

function closeSectionMgr() {
  document.getElementById('sectionMgrOv').classList.remove('open');
  document.getElementById('newSectionName').value = '';
}

function renderSectionMgrList() {
  const el = document.getElementById('sectionMgrList');
  el.innerHTML = allSections.map((s, i) => `
    <div class="smgr-row" data-id="${esc(s.id)}">
      <div class="smgr-order-btns">
        <button class="smgr-move" onclick="moveSection(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Upar">▲</button>
        <button class="smgr-move" onclick="moveSection(${i}, 1)"  ${i === allSections.length - 1 ? 'disabled' : ''} title="Neeche">▼</button>
      </div>
      <span class="smgr-name" id="smgr-name-${esc(s.id)}">${esc(s.name)}</span>
      <span class="smgr-count">${all.filter(m => m.section === s.name).length} titles</span>
      <button class="smgr-edit" onclick="startEditSection('${esc(s.id)}','${esc(s.name)}')" title="Naam change karo">✎</button>
      ${s.name !== 'Movies'
        ? `<button class="smgr-del" onclick="deleteSection('${esc(s.name)}')" title="Delete section">✕</button>`
        : `<span class="smgr-protected">🔒</span>`
      }
    </div>
  `).join('');
}

function startEditSection(id, currentName) {
  const nameEl = document.getElementById(`smgr-name-${id}`);
  if (!nameEl) return;

  // Replace span with input inline
  nameEl.outerHTML = `
    <input class="smgr-name-input" id="smgr-input-${id}"
      value="${esc(currentName)}" data-old="${esc(currentName)}"
      onkeydown="handleSectionEditKey(event,'${id}')"
      onblur="cancelEditSection('${id}','${esc(currentName)}')"
    >
    <button class="smgr-save-edit" onmousedown="event.preventDefault()" onclick="saveEditSection('${id}')">✓</button>
  `;
  const inp = document.getElementById(`smgr-input-${id}`);
  if (inp) { inp.focus(); inp.select(); }
}

function handleSectionEditKey(e, id) {
  if (e.key === 'Enter') { e.preventDefault(); saveEditSection(id); }
  if (e.key === 'Escape') {
    const inp = document.getElementById(`smgr-input-${id}`);
    cancelEditSection(id, inp ? inp.dataset.old : '');
  }
}

function cancelEditSection(id, oldName) {
  // Only restore if input still exists (not already saved)
  const inp = document.getElementById(`smgr-input-${id}`);
  if (!inp) return;
  renderSectionMgrList();
}

async function saveEditSection(id) {
  const inp = document.getElementById(`smgr-input-${id}`);
  if (!inp) return;
  const newName = inp.value.trim();
  const oldName = inp.dataset.old;
  if (!newName) { inp.style.borderColor = 'var(--red)'; return; }
  if (newName === oldName) { renderSectionMgrList(); return; }

  inp.disabled = true;

  try {
    const { data, error } = await db.rpc('admin_rename_section', {
      p_old_name: oldName, p_new_name: newName, p_password: adminPassword
    });
    if (error) throw error;
    if (!data) throw new Error('Rename failed');

    // Update local state
    allSections = allSections.map(s => s.id === id ? { ...s, name: newName } : s);
    all = all.map(m => m.section === oldName ? { ...m, section: newName } : m);
    renderSectionMgrList();
    renderSectionButtons();
    renderSectionSelect();
    render();
    toast(`✅ "${oldName}" → "${newName}" rename ho gaya!`);
  } catch (e) {
    toast('❌ Rename nahi hua: ' + e.message, true);
    renderSectionMgrList();
  }
}

async function moveSection(index, dir) {
  const newIndex = index + dir;
  if (newIndex < 0 || newIndex >= allSections.length) return;

  // Swap in local array
  const arr = [...allSections];
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];

  // Update sort_order for all (just reassign 1,2,3...)
  const updates = arr.map((s, i) => ({ id: s.id, sort_order: i + 1 }));

  try {
    // Update each section's sort_order via admin RPC
    const { error } = await db.rpc('admin_reorder_sections', {
      p_ids:    updates.map(u => u.id),
      p_orders: updates.map(u => u.sort_order),
      p_password: adminPassword
    });
    if (error) throw error;
    allSections = arr.map((s, i) => ({ ...s, sort_order: i + 1 }));
    renderSectionMgrList();
    renderSectionButtons();
    renderSectionSelect();
  } catch (e) {
    toast('❌ Reorder nahi hua: ' + e.message, true);
  }
}

async function addSection() {
  const nameEl = document.getElementById('newSectionName');
  const name = nameEl.value.trim();
  if (!name) { nameEl.style.borderColor = 'var(--red)'; setTimeout(() => nameEl.style.borderColor = '', 1000); return; }
  const btn = document.getElementById('addSectionBtn');
  btn.disabled = true; btn.textContent = 'Adding...';
  try {
    const { data, error } = await db.rpc('admin_add_section', { p_name: name, p_password: adminPassword });
    if (error) throw error;
    if (!data) throw new Error('Failed');
    nameEl.value = '';
    await loadSections();
    renderSectionMgrList();
    renderSectionButtons();
    renderSectionSelect();
    toast('✅ Section "' + name + '" add ho gaya!');
  } catch (e) {
    toast('❌ ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = '+ Add Section';
  }
}

async function deleteSection(name) {
  if (!confirm(`Section "${name}" delete karo?\nIs section ke movies "Movies" mein move ho jayenge.`)) return;
  try {
    const { data, error } = await db.rpc('admin_delete_section', { p_name: name, p_password: adminPassword });
    if (error) throw error;
    if (!data) throw new Error('Failed or protected');
    await Promise.all([loadMovies(), loadSections()]);
    renderSectionMgrList();
    renderSectionButtons();
    renderSectionSelect();
    render();
    toast('🗑️ Section delete ho gaya');
  } catch (e) {
    toast('❌ ' + e.message, true);
  }
}

/* ── Auto-detect section ── */
function detectSection(name) {
  const n = String(name || '').toLowerCase();
  if (['anime','naruto','one piece','one punch','chainsaw','solo leveling',
       'attack on titan','demon slayer','jjk','jujutsu','dragon ball','bleach',
       'black clover','dandadan','death note'].some(x => n.includes(x))) return 'Anime';
  if (['series','season','webseries','web series','netflix','prime','hbo',
       'money heist','breaking bad','better call saul','panchayat','mirzapur'].some(x => n.includes(x))) return 'Series';
  if (['korean','k-drama','k drama','oldboy','train to busan','the wailing',
       'bloodhounds','sweet home','alice in borderland'].some(x => n.includes(x))) return 'Korean';
  if (['bengali','abar proloy','bibaho','kothanodi'].some(x => n.includes(x))) return 'Bengali';
  if (['comedy','21 jump street','horrible bosses','pineapple express'].some(x => n.includes(x))) return 'Comedy';
  return sectionFilt !== 'all' ? sectionFilt : 'Movies';
}

/* ── Render list ── */
function render() {
  const q = (document.getElementById('search').value || '').toLowerCase().trim();

  const visible = all.filter(m => {
    const name    = (m.name || '').toLowerCase();
    const section = m.section || 'Movies';
    const okSearch  = name.includes(q);
    const okSection = sectionFilt === 'all' || section === sectionFilt;
    if (filt === 'link')   return okSearch && okSection && (m.url || (allLinks[m.id] && allLinks[m.id].length));
    if (filt === 'nolink') return okSearch && okSection && !m.url && !(allLinks[m.id] && allLinks[m.id].length);
    return okSearch && okSection;
  });

  document.getElementById('total').textContent       = all.length;
  document.getElementById('shown').textContent       = visible.length;
  document.getElementById('links').textContent       = all.filter(m => m.url || (allLinks[m.id] && allLinks[m.id].length)).length;
  document.getElementById('movieCount').textContent  = all.filter(m => (m.section||'Movies') === 'Movies').length;
  document.getElementById('seriesCount').textContent = all.filter(m => (m.section||'Movies') === 'Series' || (m.section||'').includes('Webseries')).length;
  document.getElementById('animeCount').textContent  = all.filter(m => (m.section||'Movies') === 'Anime').length;
  document.getElementById('badge').textContent       = all.length + ' titles';

  const nr  = document.getElementById('noRes');
  const lst = document.getElementById('list');

  if (!visible.length) { lst.innerHTML = ''; nr.style.display = 'flex'; return; }
  nr.style.display = 'none';

  const globalNo = new Map(all.map((m, i) => [String(m.id), i + 1]));

  lst.innerHTML = visible.map((m, idx) => {
    const id      = String(m.id);
    const num     = '#' + globalNo.get(id);
    const section = m.section || 'Movies';
    const delay   = Math.min(idx * 0.016, 0.32);

    // Links: movie_links first, then fallback to url column
    const links = allLinks[m.id] || [];
    let linksHtml = '';
    if (links.length > 0) {
      linksHtml = links.map(lnk =>
        `<a class="dl" href="${esc(lnk.url)}" target="_blank" rel="noopener noreferrer"
            title="${esc(lnk.label)}">↗ ${esc(lnk.label)}</a>`
      ).join('');
    } else if (m.url) {
      linksHtml = `<a class="dl" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">↗ Open</a>`;
    }

    const adminBtns = isAdmin ? `
      <button class="edit-btn"     onclick="openEdit('${esc(id)}')"    title="Edit">✎</button>
      <button class="links-btn"    onclick="openLinksMgr('${esc(id)}')" title="Manage Links">🔗</button>
      <button class="del-btn"      onclick="delMovie('${esc(id)}')"    title="Delete">✕</button>` : '';

    return `
      <div class="row" data-id="${esc(id)}" style="animation-delay:${delay}s">
        <span class="num">${num}</span>
        <span class="dot"></span>
        <span class="name">${esc(m.name)}</span>
        <span class="tag" data-sec="${esc(section)}">${esc(section)}</span>
        <div class="links-group">${linksHtml}</div>
        ${adminBtns}
      </div>`;
  }).join('');
}

/* ── Escape ── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Modal: Add ── */
function openModal() {
  document.getElementById('editId').value           = '';
  document.getElementById('modalTitle').textContent  = 'Add New Title';
  document.getElementById('saveBtn').textContent     = 'Add to List';
  document.getElementById('newName').value = '';
  document.getElementById('newUrl').value  = '';
  renderSectionSelect(sectionFilt !== 'all' ? sectionFilt : 'Movies');
  document.getElementById('ov').classList.add('open');
  setTimeout(() => document.getElementById('newName').focus(), 60);
}

/* ── Modal: Edit (admin) ── */
function openEdit(id) {
  if (!isAdmin) return toast('❌ Admin login required', true);
  const movie = all.find(m => String(m.id) === String(id));
  if (!movie)  return toast('❌ Movie nahi mili', true);
  document.getElementById('editId').value           = String(id);
  document.getElementById('newName').value          = movie.name || '';
  document.getElementById('newUrl').value           = movie.url  || '';
  renderSectionSelect(movie.section || 'Movies');
  document.getElementById('modalTitle').textContent  = 'Edit Title';
  document.getElementById('saveBtn').textContent     = 'Save Changes';
  document.getElementById('ov').classList.add('open');
  setTimeout(() => { const i = document.getElementById('newName'); i.focus(); i.select(); }, 60);
}

/* ── Modal: Close ── */
function closeModal() {
  document.getElementById('ov').classList.remove('open');
  document.getElementById('editId').value = '';
  document.getElementById('newName').value = '';
  document.getElementById('newUrl').value  = '';
  const b = document.getElementById('saveBtn');
  b.disabled    = false;
  b.textContent = 'Add to List';
}

/* ── Save (add / edit) ── */
async function saveMovie() {
  const nameInput    = document.getElementById('newName');
  const urlInput     = document.getElementById('newUrl');
  const sectionInput = document.getElementById('newSection');
  const id           = document.getElementById('editId').value.trim();

  const name    = nameInput.value.trim();
  const url     = urlInput.value.trim() || null;
  let   section = sectionInput ? sectionInput.value : 'Movies';

  if (!name) {
    nameInput.style.borderColor = 'var(--red)';
    nameInput.focus();
    setTimeout(() => { nameInput.style.borderColor = ''; }, 1200);
    return;
  }

  if (!id && (!section || section === 'Movies')) section = detectSection(name);

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Saving...';

  try {
    if (id) {
      if (!isAdmin) throw new Error('Admin login required');
      const { data, error } = await db.rpc('admin_update_movie', {
        p_id: id, p_name: name, p_url: url || '', p_section: section, p_password: adminPassword
      });
      if (error) throw error;
      if (!data)  throw new Error('No row updated');
      toast('✅ Edit ho gaya!');
    } else {
      const { error } = await db.from('movies').insert({ name, url, section });
      if (error) throw error;
      toast('✅ "' + name + '" add ho gaya!');
    }
    await Promise.all([loadMovies(), loadLinks()]);
    renderSectionButtons();
    renderSectionSelect(section);
    closeModal();
    render();
  } catch (e) {
    toast('❌ Save nahi hua: ' + e.message, true);
    console.error(e);
    btn.disabled    = false;
    btn.textContent = id ? 'Save Changes' : 'Add to List';
  }
}

/* ── Delete movie (admin) ── */
async function delMovie(id) {
  if (!isAdmin) return toast('❌ Admin login required', true);
  if (!confirm('Delete karo? Ye movie permanently remove hogi.')) return;
  try {
    const { data, error } = await db.rpc('admin_delete_movie', { p_id: id, p_password: adminPassword });
    if (error) throw error;
    if (!data)  throw new Error('Delete failed');
    all = all.filter(m => String(m.id) !== String(id));
    delete allLinks[id];
    renderSectionButtons();
    render();
    toast('🗑️ Delete ho gaya');
  } catch (e) {
    toast('❌ Delete nahi hua: ' + e.message, true);
  }
}

/* ── Links Manager Modal ── */
let linksMgrMovieId = null;

function openLinksMgr(movieId) {
  if (!isAdmin) return toast('❌ Admin required', true);
  linksMgrMovieId = movieId;
  const movie = all.find(m => String(m.id) === String(movieId));
  document.getElementById('linksMgrTitle').textContent = movie ? movie.name : 'Links';
  document.getElementById('newLinkLabel').value = '';
  document.getElementById('newLinkUrl').value   = '';
  renderLinksMgrList();
  document.getElementById('linksMgrOv').classList.add('open');
}

function closeLinksMgr() {
  document.getElementById('linksMgrOv').classList.remove('open');
  linksMgrMovieId = null;
}

function renderLinksMgrList() {
  const el    = document.getElementById('linksMgrList');
  const links = allLinks[linksMgrMovieId] || [];
  if (!links.length) {
    el.innerHTML = '<p class="no-links-msg">Koi link nahi hai abhi.</p>';
    return;
  }
  el.innerHTML = links.map(lnk => `
    <div class="lmgr-row" data-id="${esc(lnk.id)}">
      <span class="lmgr-label">${esc(lnk.label)}</span>
      <a class="lmgr-url" href="${esc(lnk.url)}" target="_blank" rel="noopener">${esc(lnk.url.length > 45 ? lnk.url.slice(0,45)+'…' : lnk.url)}</a>
      <button class="lmgr-del" onclick="deleteLink('${esc(lnk.id)}')" title="Remove link">✕</button>
    </div>
  `).join('');
}

async function addLink() {
  const label = document.getElementById('newLinkLabel').value.trim() || 'Download';
  const url   = document.getElementById('newLinkUrl').value.trim();
  if (!url) {
    document.getElementById('newLinkUrl').style.borderColor = 'var(--red)';
    setTimeout(() => document.getElementById('newLinkUrl').style.borderColor = '', 1000);
    return;
  }
  const btn = document.getElementById('addLinkBtn');
  btn.disabled = true; btn.textContent = 'Adding...';
  try {
    const { data, error } = await db.rpc('admin_add_link', {
      p_movie_id: linksMgrMovieId, p_label: label, p_url: url, p_password: adminPassword
    });
    if (error) throw error;
    if (!data) throw new Error('Add failed');
    document.getElementById('newLinkLabel').value = '';
    document.getElementById('newLinkUrl').value   = '';
    await loadLinks();
    renderLinksMgrList();
    render();
    toast('✅ Link add ho gaya!');
  } catch (e) {
    toast('❌ ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = '+ Add Link';
  }
}

async function deleteLink(linkId) {
  if (!confirm('Ye link remove karo?')) return;
  try {
    const { data, error } = await db.rpc('admin_delete_link', { p_link_id: linkId, p_password: adminPassword });
    if (error) throw error;
    if (!data) throw new Error('Delete failed');
    await loadLinks();
    renderLinksMgrList();
    render();
    toast('🗑️ Link remove ho gaya');
  } catch (e) {
    toast('❌ ' + e.message, true);
  }
}

/* ── Toast ── */
function toast(msg, isErr = false, dur = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = (isErr ? 'err ' : '') + 'show';
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}

/* ── Events ── */
document.getElementById('search').addEventListener('input', render);

document.querySelectorAll('.fb').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.fb').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    filt = b.dataset.f;
    render();
  });
});

document.getElementById('ov').addEventListener('click', e => {
  if (e.target === document.getElementById('ov')) closeModal();
});
document.getElementById('linksMgrOv').addEventListener('click', e => {
  if (e.target === document.getElementById('linksMgrOv')) closeLinksMgr();
});
document.getElementById('sectionMgrOv').addEventListener('click', e => {
  if (e.target === document.getElementById('sectionMgrOv')) closeSectionMgr();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLinksMgr(); closeSectionMgr(); }
});
document.getElementById('newName').addEventListener('keydown', e => { if (e.key === 'Enter') saveMovie(); });
document.getElementById('newUrl').addEventListener('keydown',  e => { if (e.key === 'Enter') saveMovie(); });
