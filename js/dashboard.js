const currentUser = getCurrentUser();
const welcomeText = document.getElementById('welcomeText');
const lastScore = document.getElementById('lastScore');
const lessonTotal = document.getElementById('lessonTotal');
const data = getStreakData();
document.getElementById("streakText").textContent =
  `คุณเรียนต่อเนื่อง ${data.streak} วันแล้ว 🔥`;
if (!currentUser) {
  welcomeText.textContent = 'กรุณาเข้าสู่ระบบก่อน';
  lastScore.textContent = '-';
} else {
  welcomeText.textContent = `สวัสดี ${currentUser.username}`;
  lastScore.textContent = currentUser.lastScore || 0;
}
lessonTotal.textContent = lessons.length;
