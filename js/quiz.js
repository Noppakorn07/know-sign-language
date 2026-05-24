// ─── State ────────────────────────────────────────────────
let selectedCats = ["all"];
let selectedMode = "video2text";
let selectedCount = 5;
let quizItems = [];
let currentIndex = 0;
let score = 0;
let selectedVideoAnswerId = null;

// ─── Data Helper ──────────────────────────────────────────
// รองรับทั้ง data.js แบบ lessons และแบบ categories
function getAllLessons() {
  if (typeof lessons !== "undefined" && Array.isArray(lessons)) {
    return lessons.map((lesson, index) => ({
      id: String(lesson.id ?? `lesson-${index}`),
      category: lesson.category || "ทั่วไป",
      title: lesson.title || lesson.name || "ไม่มีชื่อ",
      description: lesson.description || "",
      video: lesson.video || ""
    }));
  }

  if (typeof categories !== "undefined" && Array.isArray(categories)) {
    return categories.flatMap(category =>
      category.lessons.map((lesson, index) => ({
        id: String(lesson.id ?? `${category.id}-${index}`),
        category: category.name || "ทั่วไป",
        categoryId: category.id,
        icon: category.icon || "📚",
        title: lesson.title || lesson.name || "ไม่มีชื่อ",
        description: lesson.description || "",
        video: lesson.video || ""
      }))
    );
  }

  return [];
}

const allLessons = getAllLessons();

// ─── Elements ─────────────────────────────────────────────
const quizSetup = document.getElementById("quizSetup");
const quizArea = document.getElementById("quizArea");
const quizResult = document.getElementById("quizResult");

const catButtons = document.getElementById("quizCategoryList");
const startBtn = document.getElementById("startBtn");

const questionCount = document.getElementById("questionCount");
const scoreText = document.getElementById("scoreText");
const questionTitle = document.getElementById("questionTitle");

const quizVideoWrap = document.getElementById("quizVideoWrap");
const quizVideoBox = document.getElementById("quizVideoBox");
const expandBtn = document.getElementById("expandBtn");

const optionsBox = document.getElementById("optionsBox");
const feedback = document.getElementById("feedback");
const nextBtn = document.getElementById("nextBtn");
const progressFill = document.getElementById("progressFill");
const quitBtn = document.getElementById("quitBtn");

const videoModal = document.getElementById("videoModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalVideo = document.getElementById("modalVideo");
const modalLabel = document.getElementById("modalLabel");

// ─── Setup: หมวดหมู่ ──────────────────────────────────────
function buildCatButtons() {
  if (!catButtons) return;

  const cats = [...new Set(allLessons.map(lesson => lesson.category))];

  const catIcon = {
    "การทักทาย": "👋",
    "การแนะนำตัว": "🧑",
    "ชีวิตประจำวัน": "🏠",
    "ฉุกเฉิน": "🆘",
    "มารยาท": "🙏",
    "ตัวเลข": "🔢",
    "สีและสิ่งของ": "🎨"
  };

  catButtons.innerHTML = `
    <button class="cat-btn active" data-cat="all">🎯 ทั้งหมด</button>
    ${cats
      .map(cat => {
        return `
          <button class="cat-btn" data-cat="${cat}">
            ${catIcon[cat] || "📚"} ${cat}
          </button>
        `;
      })
      .join("")}
  `;

  catButtons.querySelectorAll(".cat-btn").forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.cat;

      if (value === "all") {
        selectedCats = ["all"];

        catButtons.querySelectorAll(".cat-btn").forEach(btn => {
          btn.classList.remove("active");
        });

        button.classList.add("active");
        return;
      }

      const allButton = catButtons.querySelector('[data-cat="all"]');

      if (allButton) {
        allButton.classList.remove("active");
      }

      selectedCats = selectedCats.filter(cat => cat !== "all");

      button.classList.toggle("active");

      if (button.classList.contains("active")) {
        selectedCats.push(value);
      } else {
        selectedCats = selectedCats.filter(cat => cat !== value);
      }

      if (selectedCats.length === 0) {
        selectedCats = ["all"];

        if (allButton) {
          allButton.classList.add("active");
        }
      }
    });
  });
}

// ─── Setup: รูปแบบข้อสอบ ────────────────────────────────
function setupModeButtons() {
  document.querySelectorAll(".mode-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      button.classList.add("active");
      selectedMode = button.dataset.mode;
    });
  });
}

// ─── Setup: จำนวนข้อ ─────────────────────────────────────
function setupCountButtons() {
  document.querySelectorAll(".count-btn").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".count-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      button.classList.add("active");

      selectedCount =
        button.dataset.count === "all"
          ? 9999
          : Number(button.dataset.count);
    });
  });
}

// ─── เริ่มทำแบบทดสอบ ───────────────────────────────────
function startQuiz() {
  let pool = allLessons.filter(lesson => lesson.video);

  if (!selectedCats.includes("all")) {
    pool = pool.filter(lesson => selectedCats.includes(lesson.category));
  }

  if (pool.length < 2) {
    alert("มีบทเรียนที่มีวิดีโอน้อยเกินไป กรุณาใส่วิดีโอในไฟล์ data.js ก่อนครับ");
    return;
  }

  quizItems = shuffle(pool).slice(0, Math.min(selectedCount, pool.length));
  currentIndex = 0;
  score = 0;

  quizSetup.classList.add("hidden");
  quizArea.classList.remove("hidden");
  quizResult.classList.add("hidden");

  renderQuestion();
}

// ─── ออกจากข้อสอบ ───────────────────────────────────────
function showSetup() {
  quizSetup.classList.remove("hidden");
  quizArea.classList.add("hidden");
  quizResult.classList.add("hidden");
}

if (quitBtn) {
  quitBtn.addEventListener("click", () => {
    if (confirm("ออกจากแบบทดสอบ?")) {
      showSetup();
    }
  });
}

// ─── แสดงข้อสอบ ─────────────────────────────────────────
function renderQuestion() {
  selectedVideoAnswerId = null;

  const item = quizItems[currentIndex];

  questionCount.textContent = `ข้อที่ ${currentIndex + 1} / ${quizItems.length}`;
  scoreText.textContent = `คะแนน ${score}`;

  feedback.textContent = "";
  feedback.className = "feedback";

  nextBtn.classList.add("hidden");

  progressFill.style.width = `${(currentIndex / quizItems.length) * 100}%`;

  if (selectedMode === "video2text") {
    renderVideo2Text(item);
  } else {
    renderText2Video(item);
  }
}

// ─── โหมด 1: ดูคลิป → เลือกคำ ───────────────────────────
function renderVideo2Text(item) {
  questionTitle.textContent = "ท่านี้หมายถึงอะไร?";
  quizVideoWrap.classList.remove("hidden");

  quizVideoBox.innerHTML = `
    <video controls autoplay muted src="${item.video}"
      onerror="this.parentElement.innerHTML='<p class=\\'no-video-msg\\'>ไม่พบวิดีโอ</p>'">
    </video>
  `;

  expandBtn.onclick = () => openVideoModal(item.video, item.title);

  const pool = allLessons.filter(lesson => lesson.id !== item.id);
  const wrongs = shuffle(pool).slice(0, 3);
  const options = shuffle([item, ...wrongs]);

  optionsBox.innerHTML = options
    .map(option => {
      return `
        <button class="option-btn" data-id="${option.id}">
          ${option.title}
        </button>
      `;
    })
    .join("");

  optionsBox.querySelectorAll(".option-btn").forEach(button => {
    button.addEventListener("click", () => {
      checkAnswer(button.dataset.id, item.id, "text");
    });
  });
}

// ─── โหมด 2: ดูคำ → ดูคลิป → เลือก → ส่งคำตอบ ─────────
function renderText2Video(item) {
  questionTitle.textContent = `"${item.title}" คือท่าภาษามือใด?`;
  quizVideoWrap.classList.add("hidden");

  const pool = allLessons.filter(
    lesson => lesson.id !== item.id && lesson.video
  );

  const wrongs = shuffle(pool).slice(0, 3);
  const options = shuffle([item, ...wrongs]);

  optionsBox.innerHTML = `
    <div class="video-options">
      ${options
        .map(option => {
          return `
            <div class="video-option-wrap" data-id="${option.id}">
              <div class="video-option-thumb">
                <video src="${option.video}" controls preload="metadata"
                  onerror="this.parentElement.classList.add('no-src')">
                </video>

                <button
                  class="expand-option-btn"
                  data-src="${option.video}"
                  data-title="${option.title || ""}">
                  ดูเต็มจอ ⛶
                </button>
              </div>

              <button class="select-video-btn" data-id="${option.id}">
                เลือกคลิปนี้เป็นคำตอบ
              </button>
            </div>
          `;
        })
        .join("")}
    </div>

    <button id="submitVideoAnswerBtn" class="btn primary hidden">
      ส่งคำตอบ
    </button>
  `;

  const submitVideoAnswerBtn = document.getElementById("submitVideoAnswerBtn");

  optionsBox.querySelectorAll(".select-video-btn").forEach(button => {
    button.addEventListener("click", () => {
      selectedVideoAnswerId = button.dataset.id;

      optionsBox.querySelectorAll(".video-option-wrap").forEach(wrap => {
        wrap.classList.remove("selected-answer");
      });

      button.closest(".video-option-wrap").classList.add("selected-answer");

      feedback.textContent = "เลือกคำตอบแล้ว กดส่งคำตอบเพื่อตรวจ";
      feedback.className = "feedback";

      submitVideoAnswerBtn.classList.remove("hidden");
    });
  });

  submitVideoAnswerBtn.addEventListener("click", () => {
    if (!selectedVideoAnswerId) {
      alert("กรุณาเลือกคลิปภาษามือก่อนส่งคำตอบ");
      return;
    }

    checkAnswer(selectedVideoAnswerId, item.id, "video");
    submitVideoAnswerBtn.disabled = true;
  });

  optionsBox.querySelectorAll(".expand-option-btn").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openVideoModal(button.dataset.src, button.dataset.title);
    });
  });
}

// ─── ตรวจคำตอบ ───────────────────────────────────────────
function checkAnswer(selectedId, correctId, type) {
  const correct = String(selectedId) === String(correctId);

  if (correct) score++;

  scoreText.textContent = `คะแนน ${score}`;

  const correctLesson = allLessons.find(
    lesson => String(lesson.id) === String(correctId)
  );

  feedback.textContent = correct
    ? "✅ ถูกต้อง เก่งมาก!"
    : `❌ ยังไม่ถูก คำตอบคือ "${correctLesson?.title || ""}"`;

  feedback.className = `feedback ${correct ? "correct" : "wrong"}`;

  if (type === "text") {
    optionsBox.querySelectorAll(".option-btn").forEach(button => {
      button.disabled = true;

      if (String(button.dataset.id) === String(correctId)) {
        button.classList.add("correct-ans");
      } else if (String(button.dataset.id) === String(selectedId)) {
        button.classList.add("wrong-ans");
      }
    });
  } else {
    optionsBox.querySelectorAll(".video-option-wrap").forEach(wrap => {
      wrap.style.pointerEvents = "none";

      if (String(wrap.dataset.id) === String(correctId)) {
        wrap.classList.add("correct-ans");
      } else if (String(wrap.dataset.id) === String(selectedId)) {
        wrap.classList.add("wrong-ans");
      }
    });

    optionsBox.querySelectorAll(".select-video-btn").forEach(button => {
      button.disabled = true;
    });
  }

  nextBtn.classList.remove("hidden");
}

// ─── ข้อต่อไป / จบ ───────────────────────────────────────
if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    currentIndex++;

    if (currentIndex >= quizItems.length) {
      showResult();
    } else {
      renderQuestion();
    }
  });
}

// ─── ผลลัพธ์ ─────────────────────────────────────────────
function showResult() {
  quizArea.classList.add("hidden");
  quizResult.classList.remove("hidden");

  const percent = Math.round((score / quizItems.length) * 100);

  const emoji = percent >= 80 ? "🏆" : percent >= 60 ? "👍" : "💪";
  const title = percent >= 80 ? "ยอดเยี่ยม!" : percent >= 60 ? "ทำได้ดี!" : "สู้ต่อไปนะ!";
  const detail = `ตอบถูก ${score} จาก ${quizItems.length} ข้อ (${percent}%)`;

  document.getElementById("resultEmoji").textContent = emoji;
  document.getElementById("resultTitle").textContent = title;
  document.getElementById("resultDetail").textContent = detail;
  document.getElementById("ringScore").textContent = score;
  document.getElementById("ringTotal").textContent = `/ ${quizItems.length}`;

  const circumference = 314;
  const offset = circumference - (percent / 100) * circumference;

  setTimeout(() => {
    document.getElementById("scoreRing").style.strokeDashoffset = offset;
  }, 100);

  if (typeof saveLastScore === "function") {
    saveLastScore(score);
  }

  if (typeof completeDailyActivity === "function") {
    completeDailyActivity("quiz");
  }

  progressFill.style.width = "100%";
}

// ─── ปุ่มทำซ้ำ / กลับไปตั้งค่า ─────────────────────────
const retryBtn = document.getElementById("retryBtn");
const backSetupBtn = document.getElementById("backSetupBtn");

if (retryBtn) {
  retryBtn.addEventListener("click", () => {
    quizResult.classList.add("hidden");
    quizArea.classList.remove("hidden");

    currentIndex = 0;
    score = 0;
    quizItems = shuffle(quizItems);

    renderQuestion();
  });
}

if (backSetupBtn) {
  backSetupBtn.addEventListener("click", showSetup);
}

// ─── Modal วิดีโอ ────────────────────────────────────────
function openVideoModal(src, label) {
  modalVideo.src = src;
  modalLabel.textContent = label || "";

  videoModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  modalVideo.play().catch(() => {});
}

function closeVideoModal() {
  modalVideo.pause();
  modalVideo.src = "";

  videoModal.classList.add("hidden");
  document.body.style.overflow = "";
}

if (modalClose) {
  modalClose.addEventListener("click", closeVideoModal);
}

if (modalBackdrop) {
  modalBackdrop.addEventListener("click", event => {
    if (event.target === modalBackdrop) {
      closeVideoModal();
    }
  });
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeVideoModal();
  }
});

// ─── Utility ─────────────────────────────────────────────
function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// ─── Init ────────────────────────────────────────────────
buildCatButtons();
setupModeButtons();
setupCountButtons();

if (startBtn) {
  startBtn.addEventListener("click", startQuiz);
}