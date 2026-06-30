/* app.js — moon-ui v3 */

const cfg = window.APP_CONFIG || {};
const SUPABASE_URL      = cfg.SUPABASE_URL      || 'PASTE_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || 'PASTE_SUPABASE_ANON_KEY_HERE';

let db            = null;
let all           = [];
let allLinks      = {};
let allSections   = [];
let filt          = 'all';
let sectionFilt   = 'all';
let sortOrder     = 'oldest';
let visible       = [];
let adminPassword = sessionStorage.getItem('movie_admin_password') || '';
let isAdmin       = adminPassword === 'Amonchand111';

/* ── Boot ── */
const BOOT_LOADER_MIN_MS = 2500; // ⬅ change this number to control how long the ghost loader stays visible (ms)
const bootStartedAt = Date.now();
function hideBootLoader() {
  const bl = document.getElementById('bootLoader');
  if (!bl) return;
  const elapsed = Date.now() - bootStartedAt;
  const wait = Math.max(0, BOOT_LOADER_MIN_MS - elapsed);
  setTimeout(() => {
    bl.classList.add('is-hidden');
    setTimeout(() => bl.remove(), 700); // clean up after fade-out transition
  }, wait);
}
function renderSkeleton(count) {
  const wrap = document.getElementById('loading');
  if (!wrap) return;
  wrap.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton-row">
      <div class="skel-thumb"></div>
      <div class="skel-line" style="max-width:${40 + Math.random()*40}%"></div>
      <div class="skel-tag"></div>
    </div>`).join('');
}
renderSkeleton(8);
requestAnimationFrame(() => document.body.classList.add('ready'));

if (SUPABASE_URL.includes('PASTE_') || SUPABASE_ANON_KEY.includes('PASTE_')) {
  document.getElementById('loading').innerHTML =
    '<span class="state-icon">❌</span><span>Supabase config missing.</span>';
  hideBootLoader();
} else {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  init();
}

/* ── Init ── */
async function init() {
  try {
    // Movies first — render the instant they arrive, don't wait for sections/links
    await loadMovies();
    document.getElementById('loading').style.display = 'none';
    hideBootLoader();
    setupEventListeners();
    render();

    // Sections load in background, patch UI silently (no full re-render/flash)
    loadSections().then(() => {
      renderSectionButtons();
      initSectionBarArrows();
      renderSectionSelect();
      updateAdminButton();
      patchLinksIntoRows(); // update existing rows in-place, no rebuild/animation replay
    }).catch(e => console.error('Sections load failed:', e));
  } catch (e) {
    document.getElementById('loading').innerHTML =
      '<span class="state-icon">❌</span><span>Load nahi hua: ' + e.message + '</span>';
    hideBootLoader();
    console.error(e);
  }
}

/* ── Event Listeners ── */
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function setupEventListeners() {
  // Search — debounced so render doesn't fire on every single keystroke
  const searchInput = document.getElementById('search');
  const searchClear  = document.getElementById('searchClear');
  const debouncedRender = debounce(render, 180);

  searchInput.addEventListener('input', () => {
    searchClear.style.display = searchInput.value ? 'flex' : 'none';
    debouncedRender();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchInput.focus();
    render();
  });

  // Filter tabs (All / Links / No Link)
  document.querySelectorAll('.fb').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filt = btn.dataset.f || 'all';
      render();
    });
  });

  // Sort dropdown
  document.querySelectorAll('.sort-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortOrder = btn.dataset.sort;
      document.getElementById('sortMenu').classList.remove('open');
      document.getElementById('sortIconBtn').classList.remove('active');
      render();
    });
  });

  // Close sort menu on outside click
  document.addEventListener('click', e => {
    const wrap = document.querySelector('.sort-icon-wrap');
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('sortMenu').classList.remove('open');
      document.getElementById('sortIconBtn').classList.remove('active');
    }
  });
}

/* ── Fetch ── */
async function loadMovies() {
  // Try the fast combined query first (movies + their links in one round trip)
  const { data, error } = await db
    .from('movies')
    .select('id,name,url,section,created_at, movie_links(id,label,url,sort_order)')
    .order('created_at', { ascending: true })
    .order('sort_order', { foreignTable: 'movie_links', ascending: true });

  if (error) {
    console.warn('Combined movies+links query failed, falling back:', error.message);
    return loadMoviesFallback();
  }

  allLinks = {};
  all = (data || []).map(m => {
    const { movie_links, ...rest } = m;
    if (movie_links && movie_links.length) {
      allLinks[m.id] = movie_links.map(l => ({ ...l, movie_id: m.id }));
    }
    return { ...rest, section: rest.section || 'Movies' };
  });
}

// Safety net: separate queries, used only if the embedded join above ever fails
async function loadMoviesFallback() {
  const { data, error } = await db
    .from('movies')
    .select('id,name,url,section,created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  all = (data || []).map(m => ({ ...m, section: m.section || 'Movies' }));

  const { data: links, error: linkErr } = await db
    .from('movie_links')
    .select('id,movie_id,label,url,sort_order')
    .order('sort_order', { ascending: true });
  if (linkErr) { console.error('Links fallback failed:', linkErr.message); return; }

  allLinks = {};
  (links || []).forEach(lnk => {
    if (!allLinks[lnk.movie_id]) allLinks[lnk.movie_id] = [];
    allLinks[lnk.movie_id].push(lnk);
  });
}

async function loadSections() {
  const { data, error } = await db
    .from('sections')
    .select('id,name,sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  allSections = data || [];
}

/* ── Admin ── */
function updateAdminButton() {
  const btn = document.getElementById('adminBtn');
  if (!btn) return;
  btn.textContent = isAdmin ? '🔓' : '🔒';
  btn.classList.toggle('admin-on', isAdmin);
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

/* ── Section Bar Arrows ── */
let _updateSbArrows = null;
function initSectionBarArrows() {
  const bar      = document.getElementById('sectionBar');
  const leftBtn  = document.getElementById('sbArrowLeft');
  const rightBtn = document.getElementById('sbArrowRight');
  if (!bar || !leftBtn || !rightBtn) return;

  function updateArrows() {
    const canLeft  = bar.scrollLeft > 4;
    const canRight = bar.scrollLeft < bar.scrollWidth - bar.clientWidth - 4;
    leftBtn.classList.toggle('visible', canLeft);
    rightBtn.classList.toggle('visible', canRight);
  }
  _updateSbArrows = updateArrows;

  leftBtn.addEventListener('click',  () => bar.scrollBy({ left: -180, behavior: 'smooth' }));
  rightBtn.addEventListener('click', () => bar.scrollBy({ left:  180, behavior: 'smooth' }));
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
  const countEl = document.getElementById('sectionMgrCount');
  if (countEl) countEl.textContent = `(${allSections.length})`;
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
  nameEl.outerHTML = `
    <input class="smgr-name-input" id="smgr-input-${id}"
      value="${esc(currentName)}"
      onkeydown="if(event.key==='Enter')saveEditSection('${id}','${esc(currentName)}');if(event.key==='Escape')renderSectionMgrList();"
    >
    <button class="smgr-save-edit" onclick="saveEditSection('${id}','${esc(currentName)}')" title="Save">&#10003;</button>`;
  setTimeout(() => {
    const inp = document.getElementById(`smgr-input-${id}`);
    if (inp) { inp.focus(); inp.select(); }
  }, 30);
}

async function saveEditSection(id, oldName) {
  const inp = document.getElementById(`smgr-input-${id}`);
  if (!inp) return;
  const newName = inp.value.trim();
  if (!newName || newName === oldName) { renderSectionMgrList(); return; }

  try {
    const { data, error } = await db.rpc('admin_rename_section', {
      p_old_name: oldName, p_new_name: newName, p_password: adminPassword
    });
    if (error) throw error;
    if (!data)  throw new Error('Rename fail — admin check karo');
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

async function moveSection(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= allSections.length) return;
  [allSections[idx], allSections[newIdx]] = [allSections[newIdx], allSections[idx]];
  const updates = allSections.map((s, i) => db.rpc('admin_update_section_order', {
    p_id: s.id, p_sort_order: i + 1, p_password: adminPassword
  }));
  await Promise.all(updates).catch(e => toast('❌ Order save nahi hua: ' + e.message, true));
  renderSectionMgrList();
  renderSectionButtons();
}

async function addSection() {
  if (!isAdmin) return toast('❌ Admin required', true);
  const inp  = document.getElementById('newSectionName');
  const name = inp.value.trim();
  if (!name) return toast('❌ Naam daalo', true);

  const btn = document.getElementById('addSectionBtn');
  btn.disabled = true;
  try {
    const { error } = await db.rpc('admin_add_section', { p_name: name, p_password: adminPassword });
    if (error) throw error;
    inp.value = '';
    await Promise.all([loadSections()]);
    renderSectionMgrList();
    renderSectionButtons();
    renderSectionSelect();
    toast(`✅ "${name}" section add ho gaya!`);
  } catch (e) {
    toast('❌ ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function deleteSection(name) {
  if (!isAdmin) return toast('❌ Admin required', true);
  if (!confirm(`"${name}" section delete karna hai? Iske saare movies → Movies section mein chale jayenge.`)) return;

  try {
    const { error } = await db.rpc('admin_delete_section', { p_name: name, p_password: adminPassword });
    if (error) throw error;
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
  if (['korean','k-drama','k drama','oldboy','train to busan'].some(x => n.includes(x))) return 'Korean';
  if (['bengali','abar proloy','bibaho','kothanodi'].some(x => n.includes(x))) return 'Bengali';
  if (['comedy','21 jump street','horrible bosses'].some(x => n.includes(x))) return 'Comedy';
  return sectionFilt !== 'all' ? sectionFilt : 'Movies';
}

const KNOWN_TAG_COLORS = ['Movies','Series','Anime','Korean','Bengali','Comedy','Hollywood Comedy','Dark Comedy','Best Webseries','Extra Mentions'];

function sectionTagStyle(section) {
  if (KNOWN_TAG_COLORS.includes(section)) return '';
  let hash = 0;
  for (let i = 0; i < section.length; i++) {
    hash = (hash * 31 + section.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const tc = `hsla(${hue}, 85%, 65%, 0.15)`;
  const tb = `hsla(${hue}, 85%, 65%, 0.28)`;
  const tf = `hsl(${hue}, 95%, 72%)`;
  return ` style="--tc:${tc};--tb:${tb};--tf:${tf}"`;
}

/* ── Render ── */
function render() {
  const q = (document.getElementById('search').value || '').toLowerCase().trim();

  let list = all.filter(m => {
    const name      = (m.name || '').toLowerCase();
    const section   = m.section || 'Movies';
    const hasLink   = m.url || (allLinks[m.id] && allLinks[m.id].length);
    const okSearch  = name.includes(q);
    const okSection = sectionFilt === 'all' || section === sectionFilt;
    if (filt === 'link')   return okSearch && okSection && hasLink;
    if (filt === 'nolink') return okSearch && okSection && !hasLink;
    return okSearch && okSection;
  });

  // Sort
  if (sortOrder === 'az') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  } else if (sortOrder === 'za') {
    list.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' }));
  } else if (sortOrder === 'oldest') {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  visible = list;

  document.getElementById('total').textContent       = all.length;
  document.getElementById('shown').textContent       = visible.length;
  document.getElementById('links').textContent       = all.filter(m => m.url || (allLinks[m.id] && allLinks[m.id].length)).length;
  document.getElementById('movieCount').textContent  = all.filter(m => (m.section||'Movies') === 'Movies').length;
  document.getElementById('seriesCount').textContent = all.filter(m => (m.section||'Movies') === 'Series' || (m.section||'').includes('Webseries')).length;
  document.getElementById('animeCount').textContent  = all.filter(m => (m.section||'Movies') === 'Anime').length;
  document.getElementById('badge').innerHTML         = all.length + ' <span class="spin-blossom">🌸</span>';

  const nr  = document.getElementById('noRes');
  const lst = document.getElementById('list');

  if (!visible.length) { lst.innerHTML = ''; nr.style.display = 'flex'; return; }
  nr.style.display = 'none';

  const globalNo = new Map(all.map((m, i) => [String(m.id), i + 1]));

  lst.innerHTML = visible.map((m, idx) => {
    const id      = String(m.id);
    const num     = '';
    const section = m.section || 'Movies';
    // Only stagger first 18 rows — beyond that delay looks laggy
    const delay   = idx < 18 ? idx * 0.022 : 0;

    const links = allLinks[m.id] || [];
    let linksHtml = '';
    if (links.length > 0) {
      linksHtml = links.map(lnk =>
        `<a class="dl" href="${esc(lnk.url)}" target="_blank" rel="noopener noreferrer" title="${esc(lnk.label)}">↗ ${esc(lnk.label)}</a>`
      ).join('');
    } else if (m.url) {
      linksHtml = `<a class="dl" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">↗ Open</a>`;
    }

    const adminBtns = isAdmin ? `
      <button class="edit-btn"  onclick="openEdit('${esc(id)}')"     title="Edit">✎</button>
      <button class="links-btn" onclick="openLinksMgr('${esc(id)}')" title="Manage Links">🔗</button>
      <button class="del-btn"   onclick="delMovie('${esc(id)}')"     title="Delete">✕</button>` : '';

    return `
      <div class="row" data-id="${esc(id)}" style="animation-delay:${delay}s">
        <span class="num">${num}</span>
        <span class="dot"></span>
        <span class="name">${esc(m.name)}</span>
        <span class="tag" data-sec="${esc(section)}"${sectionTagStyle(section)}>${esc(section)}</span>
        <div class="links-group">${linksHtml}</div>
        ${adminBtns}
      </div>`;
  }).join('') + `
    <div class="list-end">
      <div class="marquee">
        <div class="marquee_blur" aria-hidden="true">
          <p class="marquee_text">Trying To Do Better!</p>
        </div>
        <div class="marquee_clear">
          <p class="marquee_text">Trying To Do Better!</p>
        </div>
      </div>
      <p class="end-tagline">The movies we love and admire are to some extent a function of who we are when we see them.</p>
      <div class="breathe-sign">
        <span class="bs-fast">b</span>rea<span class="bs-slow">t</span>he
      </div>
    </div>`;
}

/* ── Patch links/tags into existing rows (no rebuild, no animation replay) ── */
function patchLinksIntoRows() {
  document.querySelectorAll('#list .row').forEach(rowEl => {
    const id = rowEl.dataset.id;
    const m  = all.find(mv => String(mv.id) === id);
    if (!m) return;

    const section = m.section || 'Movies';
    const tagEl = rowEl.querySelector('.tag');
    if (tagEl && tagEl.dataset.sec !== section) {
      tagEl.dataset.sec = section;
      tagEl.textContent = section;
      tagEl.removeAttribute('style');
      const styleAttr = sectionTagStyle(section).trim();
      if (styleAttr) {
        const cssText = styleAttr.replace(/^style="/, '').replace(/"$/, '');
        tagEl.setAttribute('style', cssText);
      }
    }

    const links = allLinks[m.id] || [];
    let linksHtml = '';
    if (links.length > 0) {
      linksHtml = links.map(lnk =>
        `<a class="dl" href="${esc(lnk.url)}" target="_blank" rel="noopener noreferrer" title="${esc(lnk.label)}">↗ ${esc(lnk.label)}</a>`
      ).join('');
    } else if (m.url) {
      linksHtml = `<a class="dl" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">↗ Open</a>`;
    }
    const linksGroup = rowEl.querySelector('.links-group');
    if (linksGroup && linksGroup.innerHTML !== linksHtml) {
      linksGroup.innerHTML = linksHtml;
    }
  });

  // Stats (link count) may have changed now that links are in — update numbers only
  document.getElementById('links').textContent =
    all.filter(m => m.url || (allLinks[m.id] && allLinks[m.id].length)).length;
}

/* ── Escape ── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Sort Menu Toggle ── */
function toggleSortMenu() {
  const menu = document.getElementById('sortMenu');
  const btn  = document.getElementById('sortIconBtn');
  const isOpen = menu.classList.contains('open');

  if (isOpen) {
    menu.classList.remove('open');
    btn.classList.remove('active');
    return;
  }

  // Position using fixed coords
  const rect = btn.getBoundingClientRect();
  const menuW = 155;
  let left = rect.left + rect.width / 2 - menuW / 2;
  // Keep inside screen
  if (left < 8) left = 8;
  if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;

  menu.style.top  = (rect.bottom + 8) + 'px';
  menu.style.left = left + 'px';
  menu.style.width = menuW + 'px';

  menu.classList.add('open');
  btn.classList.add('active');
}

/* ── Modal: Add ── */
function openModal() {
  document.getElementById('editId').value           = '';
  document.getElementById('modalTitle').textContent  = 'Add New Title';
  document.getElementById('saveBtn').textContent     = 'Add to List';
  document.getElementById('newName').value = '';
  document.getElementById('newUrl').value  = '';
  const lastSection = localStorage.getItem('lastAddSection');
  renderSectionSelect(lastSection || (sectionFilt !== 'all' ? sectionFilt : 'Movies'));
  document.getElementById('ov').classList.add('open');
  setTimeout(() => document.getElementById('newName').focus(), 60);
}

/* ── Modal: Edit ── */
function openEdit(id) {
  if (!isAdmin) return toast('❌ Admin login required', true);
  const movie = all.find(m => String(m.id) === String(id));
  if (!movie)  return toast('❌ Movie nahi mili', true);
  document.getElementById('editId').value            = String(id);
  document.getElementById('newName').value           = movie.name || '';
  document.getElementById('newUrl').value            = movie.url  || '';
  renderSectionSelect(movie.section || 'Movies');
  document.getElementById('modalTitle').textContent  = 'Edit Title';
  document.getElementById('saveBtn').textContent     = 'Save Changes';
  document.getElementById('ov').classList.add('open');
  setTimeout(() => { const i = document.getElementById('newName'); i.focus(); i.select(); }, 60);
}

/* ── Modal: Close ── */
function closeModal() {
  document.getElementById('ov').classList.remove('open');
}

/* ── Save Movie ── */
async function saveMovie() {
  const nameInput    = document.getElementById('newName');
  const urlInput     = document.getElementById('newUrl');
  const sectionInput = document.getElementById('newSection');
  const id           = document.getElementById('editId').value.trim();

  const name    = nameInput.value.trim();
  const url     = urlInput.value.trim() || null;
  let   section = sectionInput ? sectionInput.value : 'Movies';

  if (!id && section) localStorage.setItem('lastAddSection', section);

  if (!name) {
    nameInput.style.borderColor = 'var(--red)';
    nameInput.focus();
    setTimeout(() => { nameInput.style.borderColor = ''; }, 1200);
    return;
  }

  if (!id && (!section || section === 'Movies')) section = detectSection(name);

  // Duplicate Detection
  if (!id) {
    const nameLC  = name.toLowerCase();
    const exact   = all.find(m => (m.name || '').toLowerCase() === nameLC);
    const similar = !exact && all.find(m => {
      const ex = (m.name || '').toLowerCase();
      return ex.includes(nameLC) || nameLC.includes(ex);
    });
    const dup = exact || similar;
    if (dup) {
      const msg = exact
        ? `⚠️ "${dup.name}" already list mein hai (${dup.section}).\n\nPhir bhi add karna hai?`
        : `⚠️ Similar title mila: "${dup.name}" (${dup.section}).\n\nPhir bhi add karna hai?`;
      if (!confirm(msg)) return;
    }
  }

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
      const idx = all.findIndex(m => String(m.id) === id);
      if (idx !== -1) all[idx] = { ...all[idx], name, url, section };
      toast('✅ Edit ho gaya!');
    } else {
      const { data, error } = await db.from('movies').insert({ name, url, section }).select().single();
      if (error) throw error;
      all.push({ ...data, section: data.section || 'Movies' });
      renderSectionButtons();
      toast('✅ Add ho gaya!');
    }
    closeModal();
    render();
  } catch (e) {
    toast('❌ ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = id ? 'Save Changes' : 'Add to List';
  }
}

/* ── Delete Movie ── */
async function delMovie(id) {
  if (!isAdmin) return toast('❌ Admin required', true);
  if (!confirm('Ye title delete karna hai?')) return;
  try {
    const { error } = await db.rpc('admin_delete_movie', { p_id: id, p_password: adminPassword });
    if (error) throw error;
    all = all.filter(m => String(m.id) !== String(id));
    delete allLinks[id];
    renderSectionButtons();
    render();
    toast('🗑️ Delete ho gaya');
  } catch (e) {
    toast('❌ ' + e.message, true);
  }
}

/* ── Links Manager ── */
function openLinksMgr(id) {
  if (!isAdmin) return toast('❌ Admin required', true);
  const movie = all.find(m => String(m.id) === String(id));
  if (!movie)  return toast('❌ Movie nahi mili', true);
  document.getElementById('linksMgrTitle').textContent = `Links: ${movie.name}`;
  document.getElementById('linksMgrOv').dataset.movieId = id;
  renderLinksMgrList(id);
  document.getElementById('newLinkLabel').value = '';
  document.getElementById('newLinkUrl').value   = '';
  document.getElementById('linksMgrOv').classList.add('open');
}

function closeLinksMgr() {
  document.getElementById('linksMgrOv').classList.remove('open');
}

function renderLinksMgrList(id) {
  const movieId = id || document.getElementById('linksMgrOv').dataset.movieId;
  const links   = allLinks[movieId] || [];
  const el      = document.getElementById('linksMgrList');
  if (!links.length) { el.innerHTML = '<p class="lmgr-empty">Koi link nahi hai abhi.</p>'; return; }
  el.innerHTML = links.map(lnk => `
    <div class="lmgr-row" data-link-id="${esc(lnk.id)}">
      <span class="lmgr-label">${esc(lnk.label)}</span>
      <a  class="lmgr-url" href="${esc(lnk.url)}" target="_blank" rel="noopener">${esc(lnk.url)}</a>
      <button class="del" onclick="deleteLink('${esc(lnk.id)}','${esc(movieId)}')">✕</button>
    </div>`).join('');
}

async function addLink() {
  const movieId = document.getElementById('linksMgrOv').dataset.movieId;
  const label   = document.getElementById('newLinkLabel').value.trim() || 'Download';
  const url     = document.getElementById('newLinkUrl').value.trim();
  if (!url) return toast('❌ URL daalo', true);

  const btn = document.getElementById('addLinkBtn');
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc('admin_add_link', {
      p_movie_id: movieId, p_label: label, p_url: url, p_password: adminPassword
    });
    if (error) throw error;
    if (!allLinks[movieId]) allLinks[movieId] = [];
    allLinks[movieId].push({ id: data, movie_id: movieId, label, url, sort_order: allLinks[movieId].length });
    document.getElementById('newLinkLabel').value = '';
    document.getElementById('newLinkUrl').value   = '';
    renderLinksMgrList(movieId);
    render();
    toast('✅ Link add ho gaya!');
  } catch (e) {
    toast('❌ ' + e.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function deleteLink(linkId, movieId) {
  if (!confirm('Ye link delete karna hai?')) return;
  try {
    const { error } = await db.rpc('admin_delete_link', { p_link_id: linkId, p_password: adminPassword });
    if (error) throw error;
    if (allLinks[movieId]) allLinks[movieId] = allLinks[movieId].filter(l => String(l.id) !== String(linkId));
    renderLinksMgrList(movieId);
    render();
    toast('🗑️ Link delete ho gaya');
  } catch (e) {
    toast('❌ ' + e.message, true);
  }
}

/* ── Toast ── */
function toast(msg, err) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = err ? 'show error' : 'show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 2800);
}

/* ── Close overlay on bg click ── */
document.querySelectorAll('.ov').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

/* ── PWA: register service worker so "Add to Home Screen" opens app-like (standalone, no browser UI) ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});

    // When a new version takes over, refresh once automatically so the
    // person always sees the latest code — no manual "update" button needed.
    let refreshedOnce = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshedOnce) return;
      refreshedOnce = true;
      window.location.reload();
    });
  });
}
