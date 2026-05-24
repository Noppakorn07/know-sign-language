// ─── State ────────────────────────────────────────────────
let selectedCats = ['all'];
let selectedMode = 'video2text';
let selectedCount = 5;
let quizItems = [];
let currentIndex = 0;
let score = 0;

// ─── Elements ─────────────────────────────────────────────
const quizSetup     = document.getElementById('quizSetup');
const quizArea      = document.getElementById('quizArea');
const quizResult    = document.getElementById('quizResult');
const catButtons    = document.getElementById('catButtons');
const startBtn      = document.getElementById('startBtn');
const questionCount = document.getElementById('questionCount');
const scoreText     = document.getElementById('scoreText');
const questionTitle = document.getElementById('questionTitle');
const quizVideoWrap = document.getElementById('quizVideoWrap');
const quizVideoBox  = document.getElementById('quizVideoBox');
const expandBtn     = document.getElementById('expandBtn');
const optionsBox    = document.getElementById('optionsBox');
const feedback      = document.getElementById('feedback');
const nextBtn       = document.getElementById('nextBtn');
const progressFill  = document.getElementById('progressFill');
const quitBtn       = document.getElementById('quitBtn');
const videoModal    = document.getElementById('videoModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose    = document.getElementById('modalClose');
const modalVideo    = document.getElementById('modalVideo');
const modalLabel    = document.getElementById('modalLabel');

// ─── Setup: หมวดหมู่ ──────────────────────────────────────
function buildCatButtons() {
  const cats = [...new Set(lessons.map(l => l.category))];
  const catIcon = {
    'การทักทาย':'👋','ชีวิตประจำวัน':'🏠','ฉุกเฉิน':'🆘',
    'มารยาท':'🙏','ตัวเลข':'🔢','สีและสิ่งของ':'🎨',
  };

  catButtons.innerHTML = `
    <button class="cat-btn active" data-cat="all">🎯 ทั้งหมด</button>
    ${cats.map(c => `<button class="cat-btn" data-cat="${c}">${catIcon[c]||'📚'} ${c}</button>`).join('')}
  `;

  catButtons.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.cat;
      if (val === 'all') {
        selectedCats = ['all'];
        catButtons.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        // ยกเลิก "ทั้งหมด"
        const allBtn = catButtons.querySelector('[data-cat="all"]');
        allBtn.classList.remove('active');
        selectedCats = selectedCats.filter(c => c !== 'all');

        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          selectedCats.push(val);
        } else {
          selectedCats = selectedCats.filter(c => c !== val);
        }
        // ถ้าไม่มีเลือก fallback ทั้งหมด
        if (selectedCats.length === 0) {
          selectedCats = ['all'];
          allBtn.classList.add('active');
        }
      }
    });
  });
}

// ─── Setup: รูปแบบ ─────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// ─── Setup: จำนวนข้อ ──────────────────────────────────────
document.querySelectorAll('.count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCount = btn.dataset.count === 'all' ? 9999 : parseInt(btn.dataset.count);
  });
});

// ─── เริ่ม ─────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  // กรองตามหมวดและเฉพาะที่มีวิดีโอ
  let pool = lessons.filter(l => l.video);
  if (!selectedCats.includes('all')) {
    pool = pool.filter(l => selectedCats.includes(l.category));
  }
  if (pool.length < 2) {
    alert('มีบทเรียนที่มีวิดีโอน้อยเกินไป กรุณาใส่วิดีโอในไฟล์ data.js ก่อนครับ');
    return;
  }
  quizItems = shuffle(pool).slice(0, Math.min(selectedCount, pool.length));
  currentIndex = 0;
  score = 0;

  quizSetup.classList.add('hidden');
  quizArea.classList.remove('hidden');
  quizResult.classList.add('hidden');
  renderQuestion();
});

// ─── ออกจากข้อสอบ ─────────────────────────────────────────
quitBtn.addEventListener('click', () => {
  if (confirm('ออกจากแบบทดสอบ?')) showSetup();
});

function showSetup() {
  quizSetup.classList.remove('hidden');
  quizArea.classList.add('hidden');
  quizResult.classList.add('hidden');
}

// ─── render ข้อสอบ ─────────────────────────────────────────
function renderQuestion() {
  const item = quizItems[currentIndex];
  questionCount.textContent = `ข้อที่ ${currentIndex + 1} / ${quizItems.length}`;
  scoreText.textContent = `คะแนน ${score}`;
  feedback.textContent = '';
  feedback.className = 'feedback';
  nextBtn.classList.add('hidden');

  // progress bar
  progressFill.style.width = `${(currentIndex / quizItems.length) * 100}%`;

  if (selectedMode === 'video2text') {
    renderVideo2Text(item);
  } else {
    renderText2Video(item);
  }
}

// ── โหมด 1: ดูคลิป → เลือกคำ ─────────────────────────────
function renderVideo2Text(item) {
  questionTitle.textContent = 'ท่านี้หมายถึงอะไร?';
  quizVideoWrap.classList.remove('hidden');

  quizVideoBox.innerHTML = `
    <video controls autoplay muted src="${item.video}"
      onerror="this.parentElement.innerHTML='<p class=\\'no-video-msg\\'>ไม่พบวิดีโอ</p>'">
    </video>
  `;

  // ปุ่มขยาย
  expandBtn.onclick = () => openVideoModal(item.video, item.title);

  // ตัวเลือก 4 ข้อ (ข้อความ)
  const pool = lessons.filter(l => l.id !== item.id);
  const wrongs = shuffle(pool).slice(0, 3).map(l => ({ title: l.title, id: l.id }));
  const options = shuffle([{ title: item.title, id: item.id }, ...wrongs]);

  optionsBox.innerHTML = options.map(opt =>
    `<button class="option-btn" data-id="${opt.id}">${opt.title}</button>`
  ).join('');

  optionsBox.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => checkAnswer(parseInt(btn.dataset.id), item.id, 'text'));
  });
}

// ── โหมด 2: ดูคำ → เลือกคลิป ─────────────────────────────
function renderText2Video(item) {
  questionTitle.textContent = `"${item.title}" คือท่าภาษามือใด?`;
  quizVideoWrap.classList.add('hidden');

  // ตัวเลือก 4 คลิป
  const pool = lessons.filter(l => l.id !== item.id && l.video);
  const wrongs = shuffle(pool).slice(0, 3);
  const options = shuffle([item, ...wrongs]);

  optionsBox.innerHTML = `<div class="video-options">${options.map(opt => `
    <div class="video-option-wrap" data-id="${opt.id}">
      <div class="video-option-thumb">
        <video src="${opt.video}" muted preload="metadata"
          onerror="this.parentElement.classList.add('no-src')"></video>
        <div class="play-overlay">▶</div>
        <button class="expand-option-btn" data-src="${opt.video}" data-title="${opt.title || ''}">⛶</button>
      </div>
    </div>
  `).join('')}</div>`;

  // กดเลือกคลิป
  optionsBox.querySelectorAll('.video-option-wrap').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      if (e.target.classList.contains('expand-option-btn')) return;
      checkAnswer(parseInt(wrap.dataset.id), item.id, 'video');
    });
  });

  // ปุ่มขยายแต่ละคลิป
  optionsBox.querySelectorAll('.expand-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openVideoModal(btn.dataset.src, btn.dataset.title);
    });
  });
}

// ─── ตรวจคำตอบ ────────────────────────────────────────────
function checkAnswer(selectedId, correctId, type) {
  const correct = selectedId === correctId;
  if (correct) score++;

  scoreText.textContent = `คะแนน ${score}`;
  feedback.textContent  = correct ? '✅ ถูกต้อง เก่งมาก!' : `❌ ยังไม่ถูก คำตอบคือ "${lessons.find(l=>l.id===correctId)?.title}"`;
  feedback.className    = `feedback ${correct ? 'correct' : 'wrong'}`;

  if (type === 'text') {
    optionsBox.querySelectorAll('.option-btn').forEach(btn => {
      btn.disabled = true;
      if (parseInt(btn.dataset.id) === correctId) btn.classList.add('correct-ans');
      else if (parseInt(btn.dataset.id) === selectedId) btn.classList.add('wrong-ans');
    });
  } else {
    optionsBox.querySelectorAll('.video-option-wrap').forEach(wrap => {
      wrap.style.pointerEvents = 'none';
      if (parseInt(wrap.dataset.id) === correctId) wrap.classList.add('correct-ans');
      else if (parseInt(wrap.dataset.id) === selectedId) wrap.classList.add('wrong-ans');
    });
  }

  nextBtn.classList.remove('hidden');
}

// ─── ข้อต่อไป / จบ ────────────────────────────────────────
nextBtn.addEventListener('click', () => {
  currentIndex++;
  if (currentIndex >= quizItems.length) {
    showResult();
  } else {
    renderQuestion();
  }
});

// ─── ผลลัพธ์ ──────────────────────────────────────────────
function showResult() {
  quizArea.classList.add('hidden');
  quizResult.classList.remove('hidden');

  const pct = Math.round((score / quizItems.length) * 100);
  const emoji   = pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '💪';
  const title   = pct >= 80 ? 'ยอดเยี่ยม!' : pct >= 60 ? 'ทำได้ดี!' : 'สู้ต่อไปนะ!';
  const detail  = `ตอบถูก ${score} จาก ${quizItems.length} ข้อ (${pct}%)`;

  document.getElementById('resultEmoji').textContent  = emoji;
  document.getElementById('resultTitle').textContent  = title;
  document.getElementById('resultDetail').textContent = detail;
  document.getElementById('ringScore').textContent    = score;
  document.getElementById('ringTotal').textContent    = `/ ${quizItems.length}`;

  // animate ring
  const circumference = 314;
  const offset = circumference - (pct / 100) * circumference;
  setTimeout(() => {
    document.getElementById('scoreRing').style.strokeDashoffset = offset;
  }, 100);

  saveLastScore(score);
  completeDailyActivity("quiz");
  progressFill.style.width = '100%';
}

document.getElementById('retryBtn').addEventListener('click', () => {
  quizResult.classList.add('hidden');
  quizArea.classList.remove('hidden');
  currentIndex = 0;
  score = 0;
  quizItems = shuffle(quizItems);
  renderQuestion();
});

document.getElementById('backSetupBtn').addEventListener('click', showSetup);

// ─── Modal วิดีโอ ─────────────────────────────────────────
function openVideoModal(src, label) {
  modalVideo.src = src;
  modalLabel.textContent = label || '';
  videoModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  modalVideo.play().catch(() => {});
}
function closeVideoModal() {
  modalVideo.pause();
  modalVideo.src = '';
  videoModal.classList.add('hidden');
  document.body.style.overflow = '';
}
modalClose.addEventListener('click', closeVideoModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeVideoModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideoModal(); });

// ─── Util ─────────────────────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ─── init ─────────────────────────────────────────────────
buildCatButtons();