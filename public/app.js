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
let sortOrder     = 'newest';
let visible       = []; // currently rendered list (for random pick etc)
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
    initSectionBarArrows();
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
    .select('id,name,url,section,created_at,poster_path,year,rating')
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
  btn.textContent = isAdmin ? '🔓' : '🔒';
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
  if (_updateSbArrows) setTimeout(_updateSbArrows, 80);
}

/* ── Section Bar Arrow Scroll ── */
let _updateSbArrows = null;
function initSectionBarArrows() {
  const bar = document.getElementById('sectionBar');
  const leftBtn = document.getElementById('sbArrowLeft');
  const rightBtn = document.getElementById('sbArrowRight');
  if (!bar || !leftBtn || !rightBtn) return;

  function updateArrows() {
    const canLeft = bar.scrollLeft > 4;
    const canRight = bar.scrollLeft < bar.scrollWidth - bar.clientWidth - 4;
    leftBtn.classList.toggle('visible', canLeft);
    rightBtn.classList.toggle('visible', canRight);
  }
  _updateSbArrows = updateArrows;

  leftBtn.addEventListener('click', () => {
    bar.scrollBy({ left: -180, behavior: 'smooth' });
  });
  rightBtn.addEventListener('click', () => {
    bar.scrollBy({ left: 180, behavior: 'smooth' });
  });

  bar.addEventListener('scroll', updateArrows, { passive: true });
  setTimeout(updateArrows, 100);
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

  let list = all.filter(m => {
    const name    = (m.name || '').toLowerCase();
    const section = m.section || 'Movies';
    const okSearch  = name.includes(q);
    const okSection = sectionFilt === 'all' || section === sectionFilt;
    if (filt === 'link')   return okSearch && okSection && (m.url || (allLinks[m.id] && allLinks[m.id].length));
    if (filt === 'nolink') return okSearch && okSection && !m.url && !(allLinks[m.id] && allLinks[m.id].length);
    return okSearch && okSection;
  });

  // Sort
  list = [...list];
  if (sortOrder === 'az') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  } else if (sortOrder === 'za') {
    list.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' }));
  } else if (sortOrder === 'oldest') {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else { // newest (default)
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  visible = list;

  document.getElementById('total').textContent       = all.length;
  document.getElementById('shown').textContent       = visible.length;
  document.getElementById('links').textContent       = all.filter(m => m.url || (allLinks[m.id] && allLinks[m.id].length)).length;
  document.getElementById('movieCount').textContent  = all.filter(m => (m.section||'Movies') === 'Movies').length;
  document.getElementById('seriesCount').textContent = all.filter(m => (m.section||'Movies') === 'Series' || (m.section||'').includes('Webseries')).length;
  document.getElementById('animeCount').textContent  = all.filter(m => (m.section||'Movies') === 'Anime').length;
  document.getElementById('badge').innerHTML         = all.length + ' <span style="display:inline-block;animation:spin 3s linear infinite">🌸</span>';

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

    const poster = m.poster_path
      ? `<img class="thumb" src="https://image.tmdb.org/t/p/w92${esc(m.poster_path)}" alt="" loading="lazy">`
      : `<span class="thumb thumb-empty">🎬</span>`;

    return `
      <div class="row" data-id="${esc(id)}" style="animation-delay:${delay}s">
        ${poster}
        <span class="num">${num}</span>
        <span class="dot"></span>
        <span class="name">${esc(m.name)}</span>
        ${m.year ? `<span class="year">${esc(m.year)}</span>` : ''}
        ${m.rating ? `<span class="rating">⭐ ${esc(Number(m.rating).toFixed(1))}</span>` : ''}
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

/* ── TMDB Integration ── */
const TMDB_KEY = (window.APP_CONFIG && window.APP_CONFIG.TMDB_API_KEY) || '';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w154';

async function searchTMDB() {
  const query = document.getElementById('newName').value.trim();
  const resultsEl = document.getElementById('tmdbResults');
  const btn = document.getElementById('tmdbBtn');

  if (!query) {
    toast('❌ Pehle naam likho', true);
    return;
  }
  if (!TMDB_KEY) {
    toast('❌ TMDB API key configure nahi hai', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Searching...';
  resultsEl.innerHTML = '';

  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&include_adult=false`);
    const data = await res.json();
    const results = (data.results || [])
      .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
      .slice(0, 6);

    if (!results.length) {
      resultsEl.innerHTML = '<p class="tmdb-empty">Kuch nahi mila TMDB pe 😕</p>';
    } else {
      resultsEl.innerHTML = results.map(r => {
        const title = r.title || r.name || 'Untitled';
        const date  = r.release_date || r.first_air_date || '';
        const year  = date ? date.slice(0, 4) : '';
        const rating = r.vote_average ? r.vote_average.toFixed(1) : '';
        return `
          <div class="tmdb-card" onclick='selectTMDB(${JSON.stringify({
            title, year, rating: r.vote_average || null, poster: r.poster_path
          }).replace(/'/g, "&#39;")})'>
            <img src="${TMDB_IMG}${esc(r.poster_path)}" alt="${esc(title)}" loading="lazy">
            <div class="tmdb-card-info">
              <span class="tmdb-card-title">${esc(title)}</span>
              <span class="tmdb-card-meta">${esc(year)}${rating ? ' • ⭐ ' + esc(rating) : ''}</span>
            </div>
          </div>`;
      }).join('');
    }
  } catch (e) {
    toast('❌ TMDB search fail: ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '🎬 Fetch Poster & Info from TMDB';
  }
}

function selectTMDB(item, silent) {
  document.getElementById('newPosterPath').value = item.poster || '';
  document.getElementById('newYear').value        = item.year || '';
  document.getElementById('newRating').value      = item.rating || '';
  document.getElementById('tmdbResults').innerHTML = '';

  const preview = document.getElementById('tmdbPreview');
  const img     = document.getElementById('tmdbPreviewImg');
  const title   = document.getElementById('tmdbPreviewTitle');
  const meta    = document.getElementById('tmdbPreviewMeta');

  if (item.poster) {
    img.src = TMDB_IMG + item.poster;
    img.style.display = '';
  } else {
    img.style.display = 'none';
  }
  title.textContent = item.title || '';
  meta.textContent  = [item.year, item.rating ? '⭐ ' + Number(item.rating).toFixed(1) : ''].filter(Boolean).join(' • ');
  preview.style.display = 'flex';

  if (!silent) toast('✅ Info fetch ho gaya!');
}

function clearTMDB() {
  document.getElementById('newPosterPath').value = '';
  document.getElementById('newYear').value        = '';
  document.getElementById('newRating').value      = '';
  document.getElementById('tmdbPreview').style.display = 'none';
  document.getElementById('tmdbResults').innerHTML = '';
}


/* ── Modal: Add ── */
        
