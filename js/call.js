const db = firebase.firestore();
const auth = firebase.auth();

const sessionId = "user_" + Math.random().toString(36).slice(2, 10);

let currentUser = null;
let peer = null;
let localStream = null;
let activeCall = null;
let currentRoomId = null;
let roomUnsub = null;
let chatUnsub = null;
let waitingUnsub = null;
let lastPartnerId = null;
let aiTimer = null;

const $ = (id) => document.getElementById(id);

const btnJoin = $("btnJoin");
const btnHangup = $("btnHangup");
const btnReportLast = $("btnReportLast");
const btnLogout = $("btnLogout");
const userChip = $("userChip");
const statusBar = $("statusBar");
const statusText = $("statusText");
const localVideo = $("localVideo");
const remoteVideo = $("remoteVideo");
const remotePlaceholder = $("remotePlaceholder");
const chatInput = $("chatInput");
const btnSendChat = $("btnSendChat");
const chatMessages = $("chatMessages");
const chatStatus = $("chatStatus");
const sentenceWords = $("sentenceWords");
const aiStatusChip = $("aiStatusChip");
const localSubtitle = $("localSubtitle");
const localWord = $("localWord");
const localConf = $("localConf");
const localBar = $("localBar");
const navActions = $("navActions");

function setStatus(text, type = "") {
  statusText.textContent = text;
  statusBar.className = "status-bar";
  if (type) statusBar.classList.add(type);
}

function addMessage(text, type = "system", name = "") {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.innerHTML = name ? `<span class="name">${name}</span>${text}` : text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function resetChat() {
  chatMessages.innerHTML = `
    <div class="message system">
      กดสุ่มเพื่อเริ่มคุย เมื่อ AI อ่านภาษามือได้ ข้อความจะเข้ามาในแชทด้วย
    </div>
  `;
}

async function initCamera() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });

  localVideo.srcObject = localStream;
  return localStream;
}

function initPeer() {
  if (peer) return;

  peer = new Peer(sessionId);

  peer.on("open", async () => {
    await startPresence();
    setStatus("พร้อมใช้งาน กดปุ่ม ‘สุ่ม’ เพื่อเริ่มวิดีโอคอล");
  });

  peer.on("call", async (call) => {
    await initCamera();

    activeCall = call;
    call.answer(localStream);

    call.on("stream", (remoteStream) => {
      remoteVideo.srcObject = remoteStream;
      remotePlaceholder.style.display = "none";
      onConnected();
    });

    call.on("close", () => endCall(false));
    call.on("error", () => endCall(false));
  });

  peer.on("error", (err) => {
    console.error(err);
    setStatus("ระบบวิดีโอคอลมีปัญหา กรุณารีเฟรชหน้า", "error");
  });
}

async function startPresence() {
  await db.collection("onlineUsers").doc(sessionId).set({
    uid: currentUser?.uid || sessionId,
    email: currentUser?.email || "",
    peerId: sessionId,
    waiting: false,
    online: true,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  window.addEventListener("beforeunload", () => {
    db.collection("onlineUsers").doc(sessionId).delete();
  });
}

async function startMatchmaking() {
  if (activeCall) return;

  btnJoin.disabled = true;
  btnJoin.innerHTML = `<i class="fa-solid fa-spinner spinner"></i> กำลังสุ่ม...`;

  try {
    await initCamera();

    const usersSnap = await db.collection("onlineUsers").get();
    const otherOnline = usersSnap.docs.filter((doc) => doc.id !== sessionId);

    if (otherOnline.length === 0) {
      setStatus("ตอนนี้ไม่มีคนออนไลน์ ลองใหม่อีกครั้งภายหลัง", "error");
      btnJoin.disabled = false;
      btnJoin.innerHTML = `<i class="fa-solid fa-shuffle"></i> สุ่ม`;
      return;
    }

    const waitingUser = otherOnline.find((doc) => doc.data().waiting === true);

    if (waitingUser) {
      const partnerId = waitingUser.id;
      lastPartnerId = partnerId;

      currentRoomId = "room_" + Date.now() + "_" + sessionId;

      await db.collection("rooms").doc(currentRoomId).set({
        callerId: sessionId,
        calleeId: partnerId,
        status: "connected",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection("onlineUsers").doc(sessionId).update({ waiting: false });
      await db.collection("onlineUsers").doc(partnerId).update({ waiting: false });

      callPeer(partnerId);
      listenRoom(currentRoomId);
      listenChat(currentRoomId);
    } else {
      await db.collection("onlineUsers").doc(sessionId).update({ waiting: true });

      setStatus("กำลังรอคนอื่นกดสุ่ม...");
      resetChat();
      addMessage("กำลังรอคู่สนทนา...", "system");

      waitingUnsub = db.collection("rooms")
        .where("calleeId", "==", sessionId)
        .where("status", "==", "connected")
        .onSnapshot((snap) => {
          if (!snap.empty) {
            const doc = snap.docs[0];
            currentRoomId = doc.id;
            lastPartnerId = doc.data().callerId;

            if (waitingUnsub) waitingUnsub();

            listenRoom(currentRoomId);
            listenChat(currentRoomId);
          }
        });
    }
  } catch (err) {
    console.error(err);
    setStatus("เปิดกล้องไม่ได้ หรือระบบเชื่อมต่อผิดพลาด", "error");
    btnJoin.disabled = false;
    btnJoin.innerHTML = `<i class="fa-solid fa-shuffle"></i> สุ่ม`;
  }
}

function callPeer(partnerId) {
  const call = peer.call(partnerId, localStream);
  activeCall = call;

  call.on("stream", (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
    remotePlaceholder.style.display = "none";
    onConnected();
  });

  call.on("close", () => endCall(false));
  call.on("error", () => endCall(false));
}

function onConnected() {
  setStatus("เชื่อมต่อสำเร็จ", "connected");

  btnJoin.style.display = "none";
  btnHangup.style.display = "inline-flex";

  chatInput.disabled = false;
  btnSendChat.disabled = false;
  chatStatus.textContent = "เชื่อมต่อคู่สนทนาแล้ว";

  aiStatusChip.className = "ai-status-chip detecting";
  aiStatusChip.innerHTML = `<i class="fa-solid fa-eye"></i> AI กำลังอ่านภาษามือ`;

  startFakeAI();
}

function listenRoom(roomId) {
  if (roomUnsub) roomUnsub();

  roomUnsub = db.collection("rooms").doc(roomId).onSnapshot((doc) => {
    if (!doc.exists) return;

    const data = doc.data();
    if (data.status === "ended") {
      endCall(false);
    }
  });
}

function listenChat(roomId) {
  if (chatUnsub) chatUnsub();

  resetChat();

  chatUnsub = db.collection("rooms")
    .doc(roomId)
    .collection("messages")
    .orderBy("createdAt")
    .onSnapshot((snap) => {
      chatMessages.innerHTML = "";

      snap.forEach((doc) => {
        const msg = doc.data();
        const mine = msg.senderId === sessionId;
        addMessage(msg.text, mine ? "me" : "other", mine ? "คุณ" : "คู่สนทนา");
      });
    });
}

async function sendChat(text, fromAI = false) {
  if (!currentRoomId || !text.trim()) return;

  await db.collection("rooms")
    .doc(currentRoomId)
    .collection("messages")
    .add({
      text: fromAI ? "AI อ่านได้ว่า: " + text : text,
      senderId: sessionId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function startFakeAI() {
  stopFakeAI();

  const words = ["สวัสดี", "ขอบคุณ", "เข้าใจ", "ช่วยด้วย", "ยินดีที่ได้รู้จัก"];

  aiTimer = setInterval(() => {
    const word = words[Math.floor(Math.random() * words.length)];
    const conf = Math.floor(70 + Math.random() * 25);

    localSubtitle.classList.add("visible");
    localWord.textContent = word;
    localConf.textContent = conf + "%";
    localBar.style.width = conf + "%";

    sentenceWords.classList.remove("empty");
    sentenceWords.textContent = word;

    if (conf >= 80) {
      sendChat(word, true);
    }
  }, 6000);
}

function stopFakeAI() {
  if (aiTimer) clearInterval(aiTimer);
  aiTimer = null;
}

async function endCall(updateRoom = true) {
  stopFakeAI();

  if (activeCall) {
    activeCall.close();
    activeCall = null;
  }

  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
    remoteVideo.srcObject = null;
  }

  remotePlaceholder.style.display = "flex";

  if (currentRoomId && updateRoom) {
    await db.collection("rooms").doc(currentRoomId).update({
      status: "ended",
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }

  currentRoomId = null;

  if (roomUnsub) roomUnsub();
  if (chatUnsub) chatUnsub();

  await db.collection("onlineUsers").doc(sessionId).update({
    waiting: false
  }).catch(() => {});

  btnJoin.style.display = "inline-flex";
  btnJoin.disabled = false;
  btnJoin.innerHTML = `<i class="fa-solid fa-shuffle"></i> สุ่ม`;

  btnHangup.style.display = "none";
  btnReportLast.style.display = lastPartnerId ? "inline-flex" : "none";

  chatInput.disabled = true;
  btnSendChat.disabled = true;
  chatStatus.textContent = "ยังไม่ได้เชื่อมต่อคู่สนทนา";

  aiStatusChip.className = "ai-status-chip";
  aiStatusChip.innerHTML = `<i class="fa-solid fa-circle"></i> AI จะเริ่มอ่านเมื่อเชื่อมต่อ`;

  localSubtitle.classList.remove("visible");
  sentenceWords.className = "sentence-box empty";
  sentenceWords.textContent = "AI จะอ่านภาษามือของคุณ แล้วส่งเป็นข้อความในแชทอัตโนมัติ";

  setStatus("สายสิ้นสุดแล้ว กดสุ่มเพื่อเริ่มใหม่");
}

async function reportLastUser() {
  if (!lastPartnerId) return;

  await db.collection("reports").add({
    reporterId: sessionId,
    reportedUserId: lastPartnerId,
    reason: "รายงานจากหน้าวิดีโอคอล",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  btnReportLast.style.display = "none";
  alert("ส่งรายงานเรียบร้อยแล้ว");
}

function setupNavbarUser(user) {
  if (!navActions) return;

  if (!user) {
    navActions.innerHTML = `
      <a class="btn-soft" href="login.html">เข้าสู่ระบบ</a>
    `;
    return;
  }

  navActions.innerHTML = `
    <span class="user-chip">${user.email || "ผู้ใช้งาน"}</span>
  `;
}

btnJoin.addEventListener("click", startMatchmaking);
btnHangup.addEventListener("click", () => endCall(true));
btnReportLast.addEventListener("click", reportLastUser);

btnSendChat.addEventListener("click", () => {
  sendChat(chatInput.value);
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendChat(chatInput.value);
    chatInput.value = "";
  }
});

btnLogout.addEventListener("click", async () => {
  await db.collection("onlineUsers").doc(sessionId).delete().catch(() => {});
  await auth.signOut();
  location.href = "login.html";
});

auth.onAuthStateChanged(async (user) => {
  setupNavbarUser(user);

  if (!user) {
    currentUser = null;
    userChip.textContent = "ยังไม่ได้เข้าสู่ระบบ";
    setStatus("กรุณาเข้าสู่ระบบก่อนใช้งาน", "error");
    btnJoin.disabled = true;
    btnLogout.style.display = "none";
    return;
  }

  currentUser = user;
  userChip.textContent = user.email || "ผู้ใช้งาน";
  btnLogout.style.display = "inline-flex";
  btnJoin.disabled = false;

  initPeer();
});