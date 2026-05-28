const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const mediaTypeFilter = document.getElementById('mediaTypeFilter');
const lessonGrid = document.getElementById('lessonGrid');

function openModal(lesson, type) {
  document.getElementById('videoModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'videoModal';

  let mediaContent = '';

  if (type === 'video') {
    const videoSrc = lesson.video || '';
    mediaContent = `
      <div class="modal-video-wrap">
        ${videoSrc
          ? `<video controls autoplay src="${videoSrc}"
               onerror="this.parentElement.innerHTML='<div class=\\'modal-no-video\\'>🎬<br>ยังไม่มีวิดีโอ<br><small>ใส่ไฟล์ที่ ${videoSrc}</small></div>'"
               onplay="markDone(${lesson.id})"></video>`
          : `<div class="modal-no-video">🎬<br>ยังไม่มีวิดีโอ</div>`
        }
      </div>
    `;
  } else {
    const images = [lesson.img1, lesson.img2, lesson.img3, lesson.img4, lesson.img5].filter(src => src !== '');
    if (images.length > 0) {
      mediaContent = `
        <div style="padding: 20px; overflow-y: auto; max-height: 60vh; display: flex; flex-direction: column; gap: 16px; background: #f8fafc;">
          ${images.map(src => `<img src="${src}" style="width:100%; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.05);" onerror="this.style.display='none'">`).join('')}
        </div>
      `;
      setTimeout(() => markDone(lesson.id), 1000);
    } else {
      mediaContent = `
        <div class="modal-video-wrap">
          <div class="modal-no-video">🖼️<br>ยังไม่มีรูปภาพการสอน</div>
        </div>
      `;
    }
  }

  modal.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal-box">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">${lesson.title} (${type === 'video' ? 'วิดีโอ' : 'รูปภาพ'})</h2>
            <p class="modal-desc">${lesson.description}</p>
          </div>
          <button class="modal-close" id="modalClose">✕</button>
        </div>
        ${mediaContent}
        <div class="modal-footer">
          <span class="tag">${lesson.category}</span>
          <span class="tag level-${lesson.level}">${lesson.level}</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  function closeModal() {
    modal.querySelector('video')?.pause();
    modal.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey); // เคลียร์ Event ทิ้งเมื่อปิดโมดอล
  }

  function onKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalBackdrop')) closeModal();
  });
  document.addEventListener('keydown', onKey);
}

function getProgress() {
  if (typeof getLessonProgress === 'function') return getLessonProgress();
  return JSON.parse(localStorage.getItem('lesson_progress') || '{}');
}

function markDone(id) {
  if (typeof saveLessonProgress === 'function') {
    saveLessonProgress(id);
  } else {
    const progress = getProgress();
    progress[id] = true;
    localStorage.setItem('lesson_progress', JSON.stringify(progress));
  }
  
  if (typeof completeDailyActivity === 'function') {
    completeDailyActivity("lesson");
  }
  
  document.querySelectorAll(`[data-lesson-id="${id}"]`).forEach(el => {
    el.classList.add('done');
    if (!el.querySelector('.done-tag')) {
      el.querySelector('.lesson-meta')?.insertAdjacentHTML('beforeend',
        '<span class="tag done-tag">✓ เรียนแล้ว</span>');
    }
  });
}

function buildCard(lesson) {
  const done = getProgress()[lesson.id];
  const currentMode = mediaTypeFilter.value;
  let thumbContent = '';

  if (currentMode === 'video') {
    const videoSrc = lesson.video || '';
    thumbContent = videoSrc
      ? `<video src="${videoSrc}" preload="metadata" muted onerror="this.parentElement.classList.add('no-src')"></video><div class="play-btn">▶</div>`
      : `<div class="no-video-thumb">🎬<br><span>ยังไม่มีวิดีโอ</span></div>`;
  } else {
    const firstImg = lesson.img1 || '';
    thumbContent = firstImg
      ? `<img src="${firstImg}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<div class=\\'no-video-thumb\\'>🖼️<br><span>โหลดภาพพลาด</span></div>'"><div class="play-btn">🔍</div>`
      : `<div class="no-video-thumb">🖼️<br><span>ยังไม่มีรูปภาพ</span></div>`;
  }

  return `
    <article class="lesson-card ${done ? 'done' : ''}" data-lesson-id="${lesson.id}">
      <div class="video-thumb" onclick="openLesson(${lesson.id})">
        ${thumbContent}
      </div>
      <div class="lesson-meta">
        <span class="tag">${lesson.category}</span>
        <span class="tag level-${lesson.level}">${lesson.level}</span>
        ${done ? '<span class="tag done-tag">✓ เรียนแล้ว</span>' : ''}
      </div>
      <h3>${lesson.title}</h3>
      <p>${lesson.description}</p>
      <button class="btn primary watch-btn" onclick="openLesson(${lesson.id})">
        ${currentMode === 'video' ? '▶ ดูวิดีโอ' : '📷 ดูรูปภาพ'}
      </button>
    </article>
  `;
}

function openLesson(id) {
  const lesson = lessons.find(l => l.id === id);
  if (lesson) openModal(lesson, mediaTypeFilter.value);
}

function renderLessons() {
  const keyword = searchInput.value.trim().toLowerCase();
  const selCat = categoryFilter.value;

  const filtered = lessons.filter(l => {
    const matchKw = l.title.toLowerCase().includes(keyword) || l.description.toLowerCase().includes(keyword);
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
    'การทักทาย':     '👋',
    'ชีวิตประจำวัน':  '🏠',
    'ฉุกเฉิน':       '🚨',
    'มารยาท':       '🙏',
    'ตัวเลข':       '🔢',
    'สีและสิ่งของ':   '🎨',
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

function renderCategories() {
  categoryFilter.innerHTML = '<option value="all">ทุกหมวดหมู่</option>';
  const cats = [...new Set(lessons.map(l => l.category))];
  cats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });
}

function recordDailyLesson() {
  const today = new Date().toDateString();
  const last = localStorage.getItem('sb_last_lesson_day');
  if (last === today) return;
  localStorage.setItem('sb_last_lesson_day', today);
  const streak = parseInt(localStorage.getItem('sb_streak') || '0');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  localStorage.setItem('sb_streak', last === yesterday.toDateString() ? streak + 1 : 1);
}

// เรียกใช้ครั้งแรก
renderCategories();
renderLessons();
recordDailyLesson();

// ดักจับ Event ต่างๆ
searchInput.addEventListener('input', renderLessons);
categoryFilter.addEventListener('change', renderLessons);
mediaTypeFilter.addEventListener('change', renderLessons);