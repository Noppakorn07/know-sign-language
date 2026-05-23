const searchInput    = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const lessonGrid     = document.getElementById('lessonGrid');

// ─── Modal ────────────────────────────────────────────────
function openModal(lesson) {
  // ถ้ามี modal เก่าอยู่ให้ลบก่อน
  document.getElementById('videoModal')?.remove();

  const videoSrc = lesson.video || '';

  const modal = document.createElement('div');
  modal.id = 'videoModal';
  modal.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal-box">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">${lesson.title}</h2>
            <p class="modal-desc">${lesson.description}</p>
          </div>
          <button class="modal-close" id="modalClose">✕</button>
        </div>
        <div class="modal-video-wrap">
          ${videoSrc
            ? `<video controls autoplay src="${videoSrc}"
                 onerror="this.parentElement.innerHTML='<div class=\\'modal-no-video\\'>🎬<br>ยังไม่มีวิดีโอ<br><small>ใส่ไฟล์ที่ ${videoSrc}</small></div>'"
                 onplay="markDone(${lesson.id})"></video>`
            : `<div class="modal-no-video">🎬<br>ยังไม่มีวิดีโอ</div>`
          }
        </div>
        <div class="modal-footer">
          <span class="tag">${lesson.category}</span>
          <span class="tag level-${lesson.level}">${lesson.level}</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // ปิด modal
  function closeModal() {
    modal.querySelector('video')?.pause();
    modal.remove();
    document.body.style.overflow = '';
  }

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalBackdrop')) closeModal();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
  });
}

// ─── ติดตามบทเรียนที่เปิดแล้ว ─────────────────────────────
function getProgress() {
  return JSON.parse(localStorage.getItem('sb_progress') || '{}');
}
function markDone(id) {
  const p = getProgress();
  p[id] = true;
  localStorage.setItem('sb_progress', JSON.stringify(p));
  // อัปเดต badge บน card โดยไม่ re-render ทั้งหน้า
  document.querySelectorAll(`[data-lesson-id="${id}"]`).forEach(el => {
    el.classList.add('done');
    if (!el.querySelector('.done-tag')) {
      el.querySelector('.lesson-meta')?.insertAdjacentHTML('beforeend',
        '<span class="tag done-tag">✓ เรียนแล้ว</span>');
    }
  });
}

// ─── สร้าง card แต่ละบทเรียน ──────────────────────────────
function buildCard(lesson) {
  const done = getProgress()[lesson.id];
  const videoSrc = lesson.video || '';

  return `
    <article class="lesson-card ${done ? 'done' : ''}" data-lesson-id="${lesson.id}">
      <div class="video-thumb" onclick="openLesson(${lesson.id})">
        ${videoSrc
          ? `<video src="${videoSrc}" preload="metadata" muted
               onerror="this.parentElement.classList.add('no-src')"></video>
             <div class="play-btn">▶</div>`
          : `<div class="no-video-thumb">🎬<br><span>ยังไม่มีวิดีโอ</span></div>`
        }
      </div>
      <div class="lesson-meta">
        <span class="tag">${lesson.category}</span>
        <span class="tag level-${lesson.level}">${lesson.level}</span>
        ${done ? '<span class="tag done-tag">✓ เรียนแล้ว</span>' : ''}
      </div>
      <h3>${lesson.title}</h3>
      <p>${lesson.description}</p>
      <button class="btn primary watch-btn" onclick="openLesson(${lesson.id})">▶ ดูวิดีโอ</button>
    </article>
  `;
}

// เปิด modal จาก id
function openLesson(id) {
  const lesson = lessons.find(l => l.id === id);
  if (lesson) openModal(lesson);
}

// ─── render แยกหมวดหมู่ ────────────────────────────────────
function renderLessons() {
  const keyword = searchInput.value.trim().toLowerCase();
  const selCat  = categoryFilter.value;

  const filtered = lessons.filter(l => {
    const matchKw  = l.title.toLowerCase().includes(keyword) || l.description.toLowerCase().includes(keyword);
    const matchCat = selCat === 'all' || l.category === selCat;
    return matchKw && matchCat;
  });

  if (filtered.length === 0) {
    lessonGrid.innerHTML = '<p class="empty-msg">ไม่พบบทเรียนที่ตรงกัน</p>';
    return;
  }

  const groups = {};
  filtered.forEach(l => {
    if (!groups[l.category]) groups[l.category] = [];
    groups[l.category].push(l);
  });

  const catIcon = {
    'การทักทาย':     'default',
    'ชีวิตประจำวัน': 'default',
    'ฉุกเฉิน':       'default',
    'มารยาท':        'default',
    'ตัวเลข':        'default',
    'สีและสิ่งของ':  'default',
  };

  lessonGrid.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <section class="category-section">
      <div class="category-header">
        <span class="cat-icon">${catIcon[cat] || '📚'}</span>
        <div>
          <h2 class="cat-title">${cat}</h2>
          <p class="cat-count">${items.length} บทเรียน</p>
        </div>
      </div>
      <div class="cards-row">
        ${items.map(buildCard).join('')}
      </div>
    </section>
  `).join('');
}

// ─── populate dropdown ─────────────────────────────────────
function renderCategories() {
  const cats = [...new Set(lessons.map(l => l.category))];
  cats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });
}

// ─── Streak ───────────────────────────────────────────────
function recordDailyLesson() {
  const today = new Date().toDateString();
  const last  = localStorage.getItem('sb_last_lesson_day');
  if (last === today) return;
  localStorage.setItem('sb_last_lesson_day', today);
  const streak    = parseInt(localStorage.getItem('sb_streak') || '0');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  localStorage.setItem('sb_streak', last === yesterday.toDateString() ? streak + 1 : 1);
}

// ─── init ──────────────────────────────────────────────────
renderCategories();
renderLessons();
recordDailyLesson();

searchInput.addEventListener('input', renderLessons);
categoryFilter.addEventListener('change', renderLessons);