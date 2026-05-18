let currentIndex = 0;
let score = 0;
const quizItems = [...lessons].sort(() => Math.random() - 0.5).slice(0, Math.min(5, lessons.length));

const questionCount = document.getElementById('questionCount');
const scoreText = document.getElementById('scoreText');
const quizVideoBox = document.getElementById('quizVideoBox');
const optionsBox = document.getElementById('optionsBox');
const feedback = document.getElementById('feedback');
const nextBtn = document.getElementById('nextBtn');
const restartBtn = document.getElementById('restartBtn');

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function renderQuestion() {
  const item = quizItems[currentIndex];
  questionCount.textContent = `ข้อที่ ${currentIndex + 1}/${quizItems.length}`;
  scoreText.textContent = `คะแนน ${score}`;
  feedback.textContent = '';
  feedback.className = 'feedback';
  nextBtn.classList.add('hidden');

  quizVideoBox.innerHTML = `<video controls autoplay muted src="${item.video}" onerror="this.parentElement.innerHTML='<p>ใส่วิดีโอที่ ${item.video}</p>'"></video>`;

  const wrongChoices = lessons.filter(lesson => lesson.id !== item.id).map(lesson => lesson.title);
  const options = shuffle([item.title, ...shuffle(wrongChoices).slice(0, 3)]);

  optionsBox.innerHTML = options.map(option => `<button class="option-btn">${option}</button>`).join('');
  document.querySelectorAll('.option-btn').forEach(button => {
    button.addEventListener('click', () => checkAnswer(button.textContent, item.title));
  });
}

function checkAnswer(selected, correct) {
  document.querySelectorAll('.option-btn').forEach(button => button.disabled = true);
  if (selected === correct) {
    score += 1;
    feedback.textContent = 'ถูกต้อง เก่งมาก!';
    feedback.className = 'feedback correct';
  } else {
    feedback.textContent = `ยังไม่ถูก คำตอบคือ ${correct}`;
    feedback.className = 'feedback wrong';
  }
  scoreText.textContent = `คะแนน ${score}`;
  nextBtn.classList.remove('hidden');
}

nextBtn.addEventListener('click', () => {
  currentIndex += 1;
  if (currentIndex >= quizItems.length) {
    quizVideoBox.innerHTML = '';
    optionsBox.innerHTML = '';
    feedback.textContent = `จบแบบทดสอบ ได้ ${score}/${quizItems.length} คะแนน`;
    feedback.className = 'feedback correct';
    nextBtn.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    saveLastScore(score);
  } else {
    renderQuestion();
  }
});

restartBtn.addEventListener('click', () => location.reload());
renderQuestion();
completeDailyActivity("quiz");
alert("บันทึกการทำแบบทดสอบแล้ว 🔥");