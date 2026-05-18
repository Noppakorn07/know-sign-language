function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getYesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

function getStreakData() {
  return JSON.parse(localStorage.getItem("streakData")) || {
    streak: 0,
    lastActiveDate: "",
    todayLessons: 0,
    todayQuizDone: false
  };
}

function saveStreakData(data) {
  localStorage.setItem("streakData", JSON.stringify(data));
}

function completeDailyActivity(type) {
  const data = getStreakData();
  const today = getToday();
  const yesterday = getYesterday();

  if (data.lastActiveDate !== today) {
    if (data.lastActiveDate === yesterday) {
      data.streak += 1;
    } else {
      data.streak = 1;
    }

    data.lastActiveDate = today;
    data.todayLessons = 0;
    data.todayQuizDone = false;
  }

  if (type === "lesson") {
    data.todayLessons += 1;
  }

  if (type === "quiz") {
    data.todayQuizDone = true;
  }

  saveStreakData(data);
}