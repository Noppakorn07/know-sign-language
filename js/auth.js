let authReadyResolve;

window.authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});

function cacheUserProfile(profile) {
  sessionStorage.setItem("ksl_current_user", JSON.stringify(profile));
}

function clearUserProfile() {
  sessionStorage.removeItem("ksl_current_user");
}

function getCurrentUser() {
  return JSON.parse(sessionStorage.getItem("ksl_current_user") || "null");
}

async function loadUserProfile(firebaseUser) {
  if (!firebaseUser) {
    clearUserProfile();
    authReadyResolve(null);
    renderNavActions();
    return null;
  }

  const docRef = db.collection("users").doc(firebaseUser.uid);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    clearUserProfile();
    authReadyResolve(null);
    renderNavActions();
    return null;
  }

  const profile = {
    uid: firebaseUser.uid,
    ...docSnap.data()
  };

  cacheUserProfile(profile);
  renderNavActions();
  authReadyResolve(profile);

  return profile;
}

auth.onAuthStateChanged(async (firebaseUser) => {
  await loadUserProfile(firebaseUser);
});

function renderNavActions() {
  const box = document.getElementById("navActions");
  if (!box) return;

  const user = getCurrentUser();

  if (user) {
    box.innerHTML = `
      <span class="tag">${user.username}</span>
      <button class="btn secondary" onclick="logout()">ออก</button>
    `;
  } else {
    box.innerHTML = `
      <a class="btn secondary" href="login.html">เข้าสู่ระบบ</a>
      <a class="btn primary" href="register.html">สมัคร</a>
    `;
  }
}

async function logout() {
  await auth.signOut();
  clearUserProfile();
  window.location.href = "index.html";
}

async function updateCurrentUser(data) {
  const user = auth.currentUser;

  if (!user) return;

  await db.collection("users").doc(user.uid).update(data);

  const currentProfile = getCurrentUser();

  cacheUserProfile({
    ...currentProfile,
    ...data
  });
}

function saveLastScore(score) {
  updateCurrentUser({
    lastScore: score
  });
}

function getLessonProgress() {
  const user = getCurrentUser();
  return user?.progress || {};
}

async function saveLessonProgress(lessonId) {
  const user = getCurrentUser();

  if (!user) return;

  const progress = user.progress || {};
  progress[lessonId] = true;

  await updateCurrentUser({
    progress: progress
  });
}

function requireLogin() {
  const user = getCurrentUser();

  if (!user) {
    localStorage.setItem("sb_redirect", window.location.href);
    window.location.href = "login.html";
  }

  return user;
}

document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("registerForm");
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("authMessage");

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const username = document.getElementById("registerUsername").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const password = document.getElementById("registerPassword").value.trim();

      if (!username || !email || !password) {
        message.textContent = "กรุณากรอกข้อมูลให้ครบ";
        message.className = "feedback wrong";
        return;
      }

      try {
        const result = await auth.createUserWithEmailAndPassword(email, password);

        const userData = {
          username: username,
          email: email,
          lastScore: 0,
          progress: {},
          streakData: {
            streak: 0,
            lastActiveDate: "",
            todayLessons: 0,
            todayQuizDone: false
          },
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("users").doc(result.user.uid).set(userData);

        cacheUserProfile({
          uid: result.user.uid,
          ...userData
        });

        const redirect = localStorage.getItem("sb_redirect");
        localStorage.removeItem("sb_redirect");

        window.location.href = redirect || "dashboard.html";
      } catch (error) {
        message.textContent = "สมัครไม่สำเร็จ: " + error.message;
        message.className = "feedback wrong";
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value.trim();

      try {
        const result = await auth.signInWithEmailAndPassword(email, password);
        await loadUserProfile(result.user);

        const redirect = localStorage.getItem("sb_redirect");
        localStorage.removeItem("sb_redirect");

        window.location.href = redirect || "dashboard.html";
      } catch (error) {
        message.textContent = "เข้าสู่ระบบไม่สำเร็จ: " + error.message;
        message.className = "feedback wrong";
      }
    });
  }

  renderNavActions();
});