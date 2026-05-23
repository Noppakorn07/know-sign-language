document.addEventListener('DOMContentLoaded', () => {
  renderNavActions();

  // หน้าที่ต้อง login ก่อนเข้า
  const protectedPages = [
    'learn.html',
    'quiz.html', 
    'practice.html',
    'dashboard.html',
    'videocall.html',   // หน้าในอนาคต
    'dictionary.html',  // หน้าในอนาคต
    'progress.html',    // หน้าในอนาคต
  ];

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  if (protectedPages.includes(currentPage)) {
    const user = getCurrentUser();
    if (!user) {
      localStorage.setItem('sb_redirect', window.location.href);
      window.location.replace('login.html');
    }
  }
});