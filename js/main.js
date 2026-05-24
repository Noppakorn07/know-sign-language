document.addEventListener("DOMContentLoaded", async () => {
  if (window.authReady) {
    await window.authReady;
  }

  renderNavActions();

  const protectedPages = [
    "learn.html",
    "quiz.html",
    "practice.html",
    "dashboard.html",
    "call.html",
    "dictionary.html",
    "progress.html"
  ];

  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  if (protectedPages.includes(currentPage)) {
    const user = getCurrentUser();

    if (!user) {
      localStorage.setItem("sb_redirect", window.location.href);
      window.location.replace("login.html");
    }
  }
});