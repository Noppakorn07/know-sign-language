const USER_KEY = 'know-sign-langague';
const CURRENT_USER_KEY = 'know-sign-langague';

function getUsers() {
  return JSON.parse(localStorage.getItem(USER_KEY) || '[]');
}

function saveUsers(users) {
  localStorage.setItem(USER_KEY, JSON.stringify(users));
}

function getCurrentUser() {
  return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null');
}

function setCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  window.location.href = 'index.html';
}

function renderNavActions() {
  const box = document.getElementById('navActions');
  if (!box) return;
  const user = getCurrentUser();
  if (user) {
    box.innerHTML = `<span class="tag">${user.username}</span><button class="btn secondary" onclick="logout()">ออก</button>`;
  } else {
    box.innerHTML = `<a class="btn secondary" href="login.html">เข้าสู่ระบบ</a><a class="btn primary" href="register.html">สมัคร</a>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const message = document.getElementById('authMessage');

  if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value.trim();
      const users = getUsers();

      if (users.some(user => user.username === username)) {
        message.textContent = 'ชื่อนี้ถูกใช้แล้ว';
        message.className = 'feedback wrong';
        return;
      }

      const newUser = { username, password, lastScore: 0 };
      users.push(newUser);
      saveUsers(users);
      setCurrentUser({ username, lastScore: 0 });
      window.location.href = 'dashboard.html';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      const users = getUsers();
      const found = users.find(user => user.username === username && user.password === password);

      if (!found) {
        message.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        message.className = 'feedback wrong';
        return;
      }

      setCurrentUser({ username: found.username, lastScore: found.lastScore || 0 });
      window.location.href = 'dashboard.html';
    });
  }
});

function saveLastScore(score) {
  const current = getCurrentUser();
  if (!current) return;
  const users = getUsers();
  const index = users.findIndex(user => user.username === current.username);
  if (index !== -1) {
    users[index].lastScore = score;
    saveUsers(users);
  }
  setCurrentUser({ ...current, lastScore: score });
}
