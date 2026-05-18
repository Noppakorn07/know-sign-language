const lessonGrid = document.getElementById('lessonGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');

function renderCategories() {
  const categories = [...new Set(lessons.map(item => item.category))];
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

function renderLessons() {
  const keyword = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;

  const filtered = lessons.filter(lesson => {
    const matchKeyword = lesson.title.toLowerCase().includes(keyword) || lesson.description.toLowerCase().includes(keyword);
    const matchCategory = selectedCategory === 'all' || lesson.category === selectedCategory;
    return matchKeyword && matchCategory;
  });

  lessonGrid.innerHTML = filtered.map(lesson => `
    <article class="lesson-card">
      <div class="video-box">
        <video controls src="${lesson.video}" onerror="this.parentElement.innerHTML='<p>ใส่วิดีโอที่ ${lesson.video}</p>'"></video>
      </div>
      <div class="lesson-meta">
        <span class="tag">${lesson.category}</span>
        <span class="tag">${lesson.level}</span>
      </div>
      <h3>${lesson.title}</h3>
      <p>${lesson.description}</p>
    </article>
  `).join('') || '<p>ไม่พบบทเรียน</p>';
}

renderCategories();
renderLessons();
searchInput.addEventListener('input', renderLessons);
categoryFilter.addEventListener('change', renderLessons);completeDailyActivity("lesson");
alert("บันทึกการเรียนวันนี้แล้ว 🔥");
