import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// =========================
// CONFIG
// =========================
const MODEL_PATH = "./model/ksl-sign-model.json";
const LABEL_PATH = "./model/labels.json";

const INPUT_SIZE = 126;
const CONF_THRESHOLD = 0.8;
const COOLDOWN_MS = 2500;
const MAIN_HAND = "right";

const WAITING_TIMEOUT_MS = 60 * 1000;

const PEER_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" }
    ]
  }
};

// =========================
// DOM
// =========================
const navActions = document.getElementById("navActions");
const userChip = document.getElementById("userChip");
const btnLogout = document.getElementById("btnLogout");

const btnRandom = document.getElementById("btnRandom");
const btnCreateRoom = document.getElementById("btnCreateRoom");
const btnJoinRoom = document.getElementById("btnJoinRoom");
const btnCopyLink = document.getElementById("btnCopyLink");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomCodeBadge = document.getElementById("roomCodeBadge");

const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");

const localVideoEl = document.getElementById("localVideo");
const remoteVideoEl = document.getElementById("remoteVideo");
const remotePlaceholder = document.getElementById("remotePlaceholder");

const localSubtitle = document.getElementById("localSubtitle");
const localWordEl = document.getElementById("localWord");
const localConfEl = document.getElementById("localConf");
const localBarEl = document.getElementById("localBar");

const remoteSubtitle = document.getElementById("remoteSubtitle");
const remoteWord = document.getElementById("remoteWord");

const btnToggleVideo = document.getElementById("btnToggleVideo");
const btnToggleAI = document.getElementById("btnToggleAI");
const btnHangup = document.getElementById("btnHangup");

const sentenceWordsEl = document.getElementById("sentenceWords");
const aiStatusChip = document.getElementById("aiStatusChip");
const btnSendSentence = document.getElementById("btnSendSentence");
const btnRemoveLast = document.getElementById("btnRemoveLast");
const btnClearAll = document.getElementById("btnClearAll");

const chatStatus = document.getElementById("chatStatus");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const btnSendChat = document.getElementById("btnSendChat");

// =========================
// STATE
// =========================
let auth = null;
let db = null;
let currentUser = null;

let localStream = null;
let peer = null;
let localPeerId = "";
let activeCall = null;
let dataConn = null;

let currentRoomCode = "";
let randomUnsubscribe = null;
let roomUnsubscribe = null;

let isVideoOff = false;

let handLandmarker = null;
let tfModel = null;
let labels = [];
let aiLoaded = false;
let isAiOn = false;
let detectingAI = false;

let sentenceWords = [];
let lastAddedWord = "";
let lastAddedTime = 0;

// =========================
// BASIC UI
// =========================
function setStatus(message, type = "idle") {
  statusText.textContent = message;
  statusBar.className = "status-bar";

  if (type === "connected") statusBar.classList.add("connected");
  if (type === "error") statusBar.classList.add("error");
}

function setAiChip(html, className = "") {
  aiStatusChip.className = "ai-status-chip" + (className ? " " + className : "");
  aiStatusChip.innerHTML = html;
}

function getDisplayName() {
  if (!currentUser) return "ผู้ใช้";
  return currentUser.displayName || currentUser.email || "ผู้ใช้";
}

function setRoomCode(code) {
  currentRoomCode = code || "";
  roomCodeBadge.innerHTML = `ห้อง: <strong>${code || "-"}</strong>`;
}

function enableChat(enabled) {
  chatInput.disabled = !enabled;
  btnSendChat.disabled = !enabled;

  chatStatus.textContent = enabled
    ? "เชื่อมต่อแล้ว พิมพ์ข้อความตอบกลับได้"
    : "ยังไม่ได้เชื่อมต่อคู่สนทนา";
}

function setMainButtonsDisabled(disabled) {
  btnRandom.disabled = disabled;
  btnCreateRoom.disabled = disabled;
  btnJoinRoom.disabled = disabled;
  roomCodeInput.disabled = disabled;
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "message system";
  div.textContent = text;
  chatMessages.appendChild(div);
  scrollChatToBottom();
}

function addChatMessage(name, text, side) {
  const div = document.createElement("div");
  div.className = `message ${side}`;

  const nameEl = document.createElement("span");
  nameEl.className = "name";
  nameEl.textContent = name;

  const textEl = document.createElement("span");
  textEl.textContent = text;

  div.appendChild(nameEl);
  div.appendChild(textEl);

  chatMessages.appendChild(div);
  scrollChatToBottom();
}

function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// =========================
// AUTH
// =========================
function initFirebase() {
  if (!window.firebase || !firebase.apps.length) {
    setStatus("Firebase ยังไม่พร้อม ตรวจสอบ js/firebase-config.js", "error");
    return false;
  }

  auth = firebase.auth();
  db = firebase.firestore();

  return true;
}

function initAuthGate() {
  const ok = initFirebase();

  if (!ok) return;

  auth.onAuthStateChanged(user => {
    if (!user) {
      const redirect = encodeURIComponent("call.html" + window.location.search);
      window.location.href = `login.html?redirect=${redirect}`;
      return;
    }

    currentUser = user;

    userChip.textContent = `เข้าสู่ระบบ: ${getDisplayName()}`;
    btnLogout.style.display = "inline-flex";

    navActions.innerHTML = `
      <a class="btn-soft" href="dashboard.html">แดชบอร์ด</a>
    `;

    setStatus("พร้อมใช้งาน กดสุ่ม หรือสร้างเลขห้องได้เลย");
    prefillRoomFromURL();
  });
}

async function logout() {
  await cleanupBeforeLeave();
  await auth.signOut();
}

// =========================
// CAMERA
// =========================
async function startLocalMedia() {
  if (localStream) return true;

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("เบราว์เซอร์นี้ไม่รองรับกล้อง หรือไม่ได้เปิดผ่าน Live Server", "error");
      alert("ต้องเปิดผ่าน Live Server เช่น http://127.0.0.1:5500/call.html");
      return false;
    }

    setStatus("กำลังขออนุญาตใช้กล้อง...");

    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });

    localVideoEl.srcObject = localStream;
    localVideoEl.muted = true;
    localVideoEl.playsInline = true;

    await localVideoEl.play().catch(() => {});

    setStatus("เปิดกล้องสำเร็จ กำลังเชื่อมต่อ...");
    return true;

  } catch (error) {
    console.error("Camera error:", error);

    setStatus("เปิดกล้องไม่ได้: " + error.name, "error");

    if (error.name === "NotAllowedError") {
      alert("ยังไม่ได้อนุญาตกล้อง ให้กด Allow / อนุญาต Camera");
    } else if (error.name === "NotFoundError") {
      alert("ไม่พบกล้องในเครื่อง");
    } else if (error.name === "NotReadableError") {
      alert("กล้องถูกโปรแกรมอื่นใช้อยู่ ปิด Zoom / Meet / Camera app ก่อน");
    } else {
      alert("เปิดกล้องไม่ได้ ดู error ใน Console");
    }

    return false;
  }
}

function stopLocalMedia() {
  if (!localStream) return;

  localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  localVideoEl.srcObject = null;
}

function toggleVideo() {
  if (!localStream) return;

  isVideoOff = !isVideoOff;

  localStream.getVideoTracks().forEach(track => {
    track.enabled = !isVideoOff;
  });

  btnToggleVideo.innerHTML = isVideoOff
    ? '<i class="fa-solid fa-video-slash"></i> กล้อง (ปิด)'
    : '<i class="fa-solid fa-video"></i> กล้อง';

  btnToggleVideo.className = isVideoOff ? "ctrl-btn danger" : "ctrl-btn secondary";
}

// =========================
// PEER
// =========================
function createPeer() {
  return new Promise((resolve, reject) => {
    destroyPeer();

    peer = new window.Peer(undefined, PEER_CONFIG);

    peer.on("open", id => {
      localPeerId = id;
      resolve(id);
    });

    peer.on("call", handleIncomingCall);
    peer.on("connection", handleIncomingDataConnection);

    peer.on("error", error => {
      console.error("[PeerJS Error]", error);
      handlePeerError(error);
      reject(error);
    });
  });
}

async function prepareConnection() {
  const mediaOk = await startLocalMedia();
  if (!mediaOk) return false;

  if (!window.Peer) {
    alert("PeerJS ยังไม่โหลด กรุณาเช็กอินเทอร์เน็ต");
    setStatus("PeerJS โหลดไม่สำเร็จ", "error");
    return false;
  }

  if (!peer || peer.destroyed || !localPeerId) {
    await createPeer();
  }

  return true;
}

function callPeer(remotePeerId) {
  if (!peer || !localStream || !remotePeerId) return;

  setStatus("กำลังโทรหาคู่สนทนา...");

  activeCall = peer.call(remotePeerId, localStream);

  activeCall.on("stream", remoteStream => {
    handleCallEstablished(activeCall, remoteStream);
  });

  activeCall.on("close", handleCallEnded);
  activeCall.on("error", handleCallEnded);

  dataConn = peer.connect(remotePeerId);

  dataConn.on("open", () => {
    sendData({
      type: "hello"
    });
  });

  dataConn.on("data", handleDataMessage);
  dataConn.on("close", () => {
    dataConn = null;
  });
}

function handleIncomingCall(call) {
  if (!localStream) return;

  call.answer(localStream);

  call.on("stream", remoteStream => {
    activeCall = call;
    handleCallEstablished(call, remoteStream);
  });

  call.on("close", handleCallEnded);
  call.on("error", handleCallEnded);
}

function handleIncomingDataConnection(connection) {
  dataConn = connection;

  dataConn.on("open", () => {
    sendData({
      type: "hello"
    });
  });

  dataConn.on("data", handleDataMessage);

  dataConn.on("close", () => {
    dataConn = null;
  });
}

function handleCallEstablished(call, remoteStream) {
  activeCall = call;

  remoteVideoEl.srcObject = remoteStream;
  remoteVideoEl.onloadedmetadata = () => {
    remoteVideoEl.play().catch(() => {});
  };

  remotePlaceholder.style.display = "none";

  setStatus("เชื่อมต่อสำเร็จ กำลังสนทนา", "connected");

  btnHangup.style.display = "inline-flex";
  btnToggleAI.disabled = false;

  enableChat(true);
  addSystemMessage("เชื่อมต่อคู่สนทนาแล้ว");
}

function handleCallEnded() {
  stopAI();

  if (activeCall) {
    try { activeCall.close(); } catch (_) {}
    activeCall = null;
  }

  if (dataConn) {
    try { dataConn.close(); } catch (_) {}
    dataConn = null;
  }

  remoteVideoEl.srcObject = null;
  remotePlaceholder.style.display = "flex";
  remoteSubtitle.classList.remove("visible");

  enableChat(false);
  setStatus("สายถูกตัดหรือคู่สนทนาออกจากห้อง", "error");
  addSystemMessage("คู่สนทนาออกจากห้องแล้ว");
}

function handlePeerError(error) {
  const messageMap = {
    network: "ปัญหาเครือข่าย กรุณาตรวจสอบอินเทอร์เน็ต",
    "peer-unavailable": "ยังไม่พบคู่สนทนา",
    disconnected: "การเชื่อมต่อถูกตัด",
    "server-error": "เซิร์ฟเวอร์ PeerJS มีปัญหา",
    "unavailable-id": "ID นี้ถูกใช้งานอยู่"
  };

  setStatus(messageMap[error.type] || "เกิดข้อผิดพลาด: " + error.type, "error");
}

function destroyPeer() {
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (_) {}
  }

  peer = null;
  localPeerId = "";
}

// =========================
// RANDOM MATCHMAKING
// =========================
async function startRandomCall() {
  if (!currentUser) return;

  try {
    setMainButtonsDisabled(true);
    setRoomCode("");

    const ok = await prepareConnection();
    if (!ok) {
      setMainButtonsDisabled(false);
      return;
    }

    setStatus("กำลังสุ่มหาคู่สนทนา...");

    const waitingRef = db.collection("matchmaking").doc("waiting");
    const now = Date.now();

    let matchResult = null;

    await db.runTransaction(async tx => {
      const waitingSnap = await tx.get(waitingRef);

      if (waitingSnap.exists) {
        const waiting = waitingSnap.data();

        const isValid =
          waiting &&
          waiting.uid !== currentUser.uid &&
          waiting.peerId &&
          waiting.expiresAtMs &&
          waiting.expiresAtMs > now;

        if (isValid) {
          const roomCode = createRoomCode();
          const roomRef = db.collection("rooms").doc(roomCode);

          tx.delete(waitingRef);

          tx.set(roomRef, {
            roomCode,
            mode: "random",
            status: "matched",

            hostUid: waiting.uid,
            hostName: waiting.name || "คู่สนทนา",
            hostPeerId: waiting.peerId,

            guestUid: currentUser.uid,
            guestName: getDisplayName(),
            guestPeerId: localPeerId,

            createdAtMs: now,
            updatedAtMs: now
          });

          matchResult = {
            role: "guest",
            roomCode,
            hostPeerId: waiting.peerId
          };

        } else {
          tx.set(waitingRef, {
            uid: currentUser.uid,
            name: getDisplayName(),
            peerId: localPeerId,
            createdAtMs: now,
            expiresAtMs: now + WAITING_TIMEOUT_MS
          });

          matchResult = {
            role: "host"
          };
        }

      } else {
        tx.set(waitingRef, {
          uid: currentUser.uid,
          name: getDisplayName(),
          peerId: localPeerId,
          createdAtMs: now,
          expiresAtMs: now + WAITING_TIMEOUT_MS
        });

        matchResult = {
          role: "host"
        };
      }
    });

    if (!matchResult) {
      setStatus("สุ่มไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
      setMainButtonsDisabled(false);
      return;
    }

    if (matchResult.role === "guest") {
      setRoomCode(matchResult.roomCode);
      roomCodeInput.value = matchResult.roomCode;
      addSystemMessage("จับคู่สำเร็จ กำลังเชื่อมต่อ...");
      callPeer(matchResult.hostPeerId);
      return;
    }

    if (matchResult.role === "host") {
      setStatus("กำลังรอคู่สนทนาเข้ามา...");
      addSystemMessage("กำลังรอคนอื่นสุ่มมาเจอคุณ");

      listenForRandomMatch();
    }

  } catch (error) {
    console.error(error);
    setStatus("สุ่มคอลไม่สำเร็จ: " + error.message, "error");
    setMainButtonsDisabled(false);
  }
}

function listenForRandomMatch() {
  stopRandomListener();

  randomUnsubscribe = db.collection("rooms")
    .where("hostPeerId", "==", localPeerId)
    .where("status", "==", "matched")
    .limit(1)
    .onSnapshot(snapshot => {
      if (snapshot.empty) return;

      const doc = snapshot.docs[0];
      const room = doc.data();

      setRoomCode(room.roomCode || doc.id);
      roomCodeInput.value = room.roomCode || doc.id;

      setStatus("พบคู่สนทนาแล้ว รอการเชื่อมต่อ...", "connected");
      addSystemMessage("พบคู่สนทนาแล้ว");
    }, error => {
      console.error(error);
      setStatus("รอสุ่มผิดพลาด: " + error.message, "error");
    });
}

function stopRandomListener() {
  if (randomUnsubscribe) {
    randomUnsubscribe();
    randomUnsubscribe = null;
  }
}

// =========================
// ROOM CODE
// =========================
async function createRoomByCode() {
  if (!currentUser) return;

  try {
    setMainButtonsDisabled(true);

    const ok = await prepareConnection();
    if (!ok) {
      setMainButtonsDisabled(false);
      return;
    }

    const roomCode = await createUniqueRoomCode();

    await db.collection("roomCodes").doc(roomCode).set({
      roomCode,
      status: "waiting",
      hostUid: currentUser.uid,
      hostName: getDisplayName(),
      hostPeerId: localPeerId,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now()
    });

    setRoomCode(roomCode);
    roomCodeInput.value = roomCode;

    setStatus(`สร้างห้อง ${roomCode} แล้ว รอเพื่อนเข้าเลขห้อง`);
    addSystemMessage(`สร้างห้อง ${roomCode} แล้ว ส่งเลขนี้ให้เพื่อน`);

    listenRoomCode(roomCode);

    btnHangup.style.display = "inline-flex";
    btnToggleAI.disabled = false;

  } catch (error) {
    console.error(error);
    setStatus("สร้างเลขห้องไม่สำเร็จ: " + error.message, "error");
    setMainButtonsDisabled(false);
  }
}

async function joinRoomByCode() {
  if (!currentUser) return;

  const roomCode = roomCodeInput.value.trim();

  if (!/^\d{6}$/.test(roomCode)) {
    alert("กรุณากรอกเลขห้อง 6 หลัก");
    return;
  }

  try {
    setMainButtonsDisabled(true);

    const ok = await prepareConnection();
    if (!ok) {
      setMainButtonsDisabled(false);
      return;
    }

    const roomRef = db.collection("roomCodes").doc(roomCode);
    const roomSnap = await roomRef.get();

    if (!roomSnap.exists) {
      alert("ไม่พบเลขห้องนี้");
      setMainButtonsDisabled(false);
      return;
    }

    const room = roomSnap.data();

    if (!room.hostPeerId) {
      alert("ห้องนี้ยังไม่พร้อม");
      setMainButtonsDisabled(false);
      return;
    }

    await roomRef.update({
      status: "matched",
      guestUid: currentUser.uid,
      guestName: getDisplayName(),
      guestPeerId: localPeerId,
      updatedAtMs: Date.now()
    });

    setRoomCode(roomCode);
    addSystemMessage(`เข้าห้อง ${roomCode} แล้ว`);
    callPeer(room.hostPeerId);

  } catch (error) {
    console.error(error);
    setStatus("เข้าเลขห้องไม่สำเร็จ: " + error.message, "error");
    setMainButtonsDisabled(false);
  }
}

function listenRoomCode(roomCode) {
  stopRoomListener();

  roomUnsubscribe = db.collection("roomCodes").doc(roomCode).onSnapshot(doc => {
    if (!doc.exists) return;

    const data = doc.data();

    if (data.status === "matched" && data.guestName) {
      addSystemMessage(`${data.guestName} เข้าห้องแล้ว`);
      setStatus("พบคู่สนทนาแล้ว รอการเชื่อมต่อ...", "connected");
    }
  });
}

function stopRoomListener() {
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
}

function createRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createUniqueRoomCode() {
  for (let i = 0; i < 20; i++) {
    const code = createRoomCode();
    const snap = await db.collection("roomCodes").doc(code).get();

    if (!snap.exists) return code;
  }

  throw new Error("สร้างเลขห้องไม่สำเร็จ");
}

function copyRoomLink() {
  const code = currentRoomCode || roomCodeInput.value.trim();

  if (!code) {
    alert("ยังไม่มีเลขห้องให้คัดลอก");
    return;
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", code);

  navigator.clipboard.writeText(url.toString()).then(() => {
    btnCopyLink.innerHTML = '<i class="fa-solid fa-check"></i> คัดลอกแล้ว';

    setTimeout(() => {
      btnCopyLink.innerHTML = '<i class="fa-solid fa-copy"></i> คัดลอกลิงก์';
    }, 1800);
  });
}

function prefillRoomFromURL() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");

  if (room) {
    roomCodeInput.value = room;
    setRoomCode(room);
  }
}

// =========================
// DATA CHANNEL / CHAT
// =========================
function sendData(payload) {
  if (!dataConn || !dataConn.open) return;

  dataConn.send({
    ...payload,
    senderName: getDisplayName(),
    sentAt: Date.now()
  });
}

function handleDataMessage(data) {
  if (!data || typeof data !== "object") return;

  if (data.type === "hello") {
    addSystemMessage(`${data.senderName || "คู่สนทนา"} เข้าร่วมแล้ว`);
  }

  if (data.type === "chat") {
    addChatMessage(data.senderName || "คู่สนทนา", data.text, "other");
  }

  if (data.type === "sentence") {
    addChatMessage(data.senderName || "คู่สนทนา", data.text, "other");
  }

  if (data.type === "sign-word") {
    remoteWord.textContent = `${data.word} (${data.confidence}%)`;
    remoteSubtitle.classList.add("visible");

    setTimeout(() => {
      remoteSubtitle.classList.remove("visible");
    }, 2500);
  }
}

function sendChatMessage() {
  const text = chatInput.value.trim();

  if (!text) return;

  addChatMessage("คุณ", text, "me");

  sendData({
    type: "chat",
    text
  });

  chatInput.value = "";
}

function sendSentenceToChat() {
  const text = sentenceWords.join(" ").trim();

  if (!text) {
    alert("ยังไม่มีข้อความจากภาษามือให้ส่ง");
    return;
  }

  addChatMessage("คุณ", text, "me");

  sendData({
    type: "sentence",
    text
  });
}

// =========================
// AI
// =========================
async function loadAI() {
  if (aiLoaded) return true;

  setAiChip('<span class="spinner">⟳</span> กำลังโหลด AI...', "loading");

  try {
    if (!window.tf) {
      alert("TensorFlow.js ยังไม่โหลด กรุณาเช็กอินเทอร์เน็ต");
      return false;
    }

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.65,
      minHandPresenceConfidence: 0.65,
      minTrackingConfidence: 0.65
    });

    tfModel = await window.tf.loadLayersModel(MODEL_PATH);

    const response = await fetch(LABEL_PATH);
    labels = await response.json();

    aiLoaded = true;

    setAiChip('<i class="fa-solid fa-check"></i> AI พร้อม', "ready");
    return true;

  } catch (error) {
    console.error("[AI load error]", error);
    setAiChip('<i class="fa-solid fa-xmark"></i> โหลด AI ไม่ได้', "");
    alert("โหลด AI ไม่ได้ ตรวจสอบไฟล์ model/ksl-sign-model.json, weights.bin และ labels.json");
    return false;
  }
}

async function toggleAI() {
  if (!localStream) {
    alert("กรุณาเปิดกล้องก่อน");
    return;
  }

  if (!isAiOn) {
    const ok = await loadAI();

    if (!ok) return;

    isAiOn = true;
    detectingAI = true;

    btnToggleAI.innerHTML = '<i class="fa-solid fa-hand-sparkles"></i> ปิด AI ภาษามือ';
    btnToggleAI.className = "ctrl-btn active-ai";

    localSubtitle.classList.add("visible");

    setAiChip('<i class="fa-solid fa-eye"></i> กำลังตรวจจับ...', "detecting");

    detectLoop();

  } else {
    stopAI();
  }
}

function stopAI() {
  if (!isAiOn) return;

  isAiOn = false;
  detectingAI = false;

  localSubtitle.classList.remove("visible");

  btnToggleAI.innerHTML = '<i class="fa-solid fa-hand-sparkles"></i> เปิด AI ภาษามือ';
  btnToggleAI.className = "ctrl-btn primary";

  setAiChip('<i class="fa-solid fa-circle"></i> AI ปิดอยู่', "");
}

function detectLoop() {
  if (!detectingAI || !handLandmarker) return;

  if (!localVideoEl.videoWidth) {
    requestAnimationFrame(detectLoop);
    return;
  }

  const result = handLandmarker.detectForVideo(localVideoEl, performance.now());

  predictGesture(result);

  requestAnimationFrame(detectLoop);
}

function predictGesture(result) {
  if (!tfModel || labels.length === 0) return;

  const vector = landmarksToVector(result);

  if (!vector) {
    localWordEl.textContent = "–";
    localConfEl.textContent = "0%";
    localBarEl.style.width = "0%";
    return;
  }

  const input = window.tf.tensor2d([vector], [1, INPUT_SIZE]);
  const prediction = tfModel.predict(input);
  const scores = Array.from(prediction.dataSync());

  input.dispose();
  prediction.dispose();

  let maxIndex = 0;
  let maxScore = scores[0];

  scores.forEach((score, index) => {
    if (score > maxScore) {
      maxScore = score;
      maxIndex = index;
    }
  });

  const word = labels[maxIndex] || "ไม่ทราบ";
  const confidence = Math.round(maxScore * 100);

  localWordEl.textContent = word;
  localConfEl.textContent = `${confidence}%`;
  localBarEl.style.width = `${confidence}%`;

  if (maxScore >= CONF_THRESHOLD) {
    addWordToSentence(word, confidence);
  }
}

function landmarksToVector(result) {
  const vector = new Array(INPUT_SIZE).fill(0);

  if (!result || !result.landmarks || result.landmarks.length === 0) {
    return null;
  }

  const hands = result.landmarks.map((landmarks, index) => {
    const handedness =
      result.handednesses?.[index]?.[0]?.categoryName || "";

    const centerX =
      landmarks.reduce((sum, point) => sum + point.x, 0) / landmarks.length;

    return {
      landmarks,
      handedness,
      centerX
    };
  });

  let leftHand = hands.find(hand => hand.handedness === "Left");
  let rightHand = hands.find(hand => hand.handedness === "Right");

  if (!leftHand || !rightHand) {
    const sorted = [...hands].sort((a, b) => a.centerX - b.centerX);

    if (!leftHand) leftHand = sorted[0] || null;
    if (!rightHand) rightHand = sorted[1] || null;
  }

  if (leftHand && rightHand) {
    const leftWrist = leftHand.landmarks[0];
    const rightWrist = rightHand.landmarks[0];

    const baseX = (leftWrist.x + rightWrist.x) / 2;
    const baseY = (leftWrist.y + rightWrist.y) / 2;
    const baseZ = ((leftWrist.z || 0) + (rightWrist.z || 0)) / 2;

    const scale =
      Math.hypot(leftWrist.x - rightWrist.x, leftWrist.y - rightWrist.y) || 1;

    writeHandToVector(vector, leftHand, 0, baseX, baseY, baseZ, scale);
    writeHandToVector(vector, rightHand, 63, baseX, baseY, baseZ, scale);

    return vector;
  }

  const detectedHand = hands[0];

  if (!detectedHand) return null;

  const wrist = detectedHand.landmarks[0];
  const indexBase = detectedHand.landmarks[5] || wrist;

  const baseX = wrist.x;
  const baseY = wrist.y;
  const baseZ = wrist.z || 0;

  const scale =
    Math.hypot(indexBase.x - wrist.x, indexBase.y - wrist.y) || 1;

  const offset = MAIN_HAND === "left" ? 0 : 63;

  writeHandToVector(vector, detectedHand, offset, baseX, baseY, baseZ, scale);

  return vector;
}

function writeHandToVector(vector, hand, offset, baseX, baseY, baseZ, scale) {
  hand.landmarks.forEach((point, index) => {
    vector[offset + index * 3] = (point.x - baseX) / scale;
    vector[offset + index * 3 + 1] = (point.y - baseY) / scale;
    vector[offset + index * 3 + 2] =
      ((point.z || 0) - baseZ) / scale;
  });
}

// =========================
// SENTENCE
// =========================
function addWordToSentence(word, confidence) {
  const now = Date.now();

  if (word === lastAddedWord && now - lastAddedTime < COOLDOWN_MS) {
    return;
  }

  lastAddedWord = word;
  lastAddedTime = now;

  sentenceWords.push(word);
  renderSentence();

  sendData({
    type: "sign-word",
    word,
    confidence
  });
}

function renderSentence() {
  if (sentenceWords.length === 0) {
    sentenceWordsEl.textContent = 'ทำท่าภาษามือหน้ากล้อง แล้วกด "เปิด AI ภาษามือ"';
    sentenceWordsEl.classList.add("empty");
  } else {
    sentenceWordsEl.textContent = sentenceWords.join(" ");
    sentenceWordsEl.classList.remove("empty");
  }
}

// =========================
// HANGUP / CLEANUP
// =========================
async function hangup() {
  await cleanupBeforeLeave();

  setStatus("วางสายแล้ว สามารถเริ่มใหม่ได้");
  addSystemMessage("วางสายแล้ว");

  setMainButtonsDisabled(false);
}

async function cleanupBeforeLeave() {
  stopRandomListener();
  stopRoomListener();
  stopAI();

  if (activeCall) {
    try { activeCall.close(); } catch (_) {}
    activeCall = null;
  }

  if (dataConn) {
    try { dataConn.close(); } catch (_) {}
    dataConn = null;
  }

  if (currentUser && db && localPeerId) {
    try {
      const waitingRef = db.collection("matchmaking").doc("waiting");
      const waitingSnap = await waitingRef.get();

      if (waitingSnap.exists && waitingSnap.data().peerId === localPeerId) {
        await waitingRef.delete();
      }
    } catch (error) {
      console.warn("cleanup waiting error:", error);
    }
  }

  destroyPeer();
  stopLocalMedia();

  remoteVideoEl.srcObject = null;
  remotePlaceholder.style.display = "flex";
  remoteSubtitle.classList.remove("visible");

  btnHangup.style.display = "none";
  btnToggleAI.disabled = true;
  btnToggleAI.innerHTML = '<i class="fa-solid fa-hand-sparkles"></i> เปิด AI ภาษามือ';
  btnToggleAI.className = "ctrl-btn primary";

  enableChat(false);
  setRoomCode("");
  currentRoomCode = "";

  roomCodeInput.disabled = false;
}

// =========================
// EVENTS
// =========================
function bindEvents() {
  btnRandom.addEventListener("click", startRandomCall);
  btnCreateRoom.addEventListener("click", createRoomByCode);
  btnJoinRoom.addEventListener("click", joinRoomByCode);
  btnCopyLink.addEventListener("click", copyRoomLink);

  roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value.replace(/\D/g, "").slice(0, 6);
  });

  roomCodeInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      joinRoomByCode();
    }
  });

  btnToggleVideo.addEventListener("click", toggleVideo);
  btnToggleAI.addEventListener("click", toggleAI);
  btnHangup.addEventListener("click", hangup);

  btnSendChat.addEventListener("click", sendChatMessage);

  chatInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      sendChatMessage();
    }
  });

  btnSendSentence.addEventListener("click", sendSentenceToChat);

  btnRemoveLast.addEventListener("click", () => {
    sentenceWords.pop();
    renderSentence();
  });

  btnClearAll.addEventListener("click", () => {
    sentenceWords = [];
    lastAddedWord = "";

    localWordEl.textContent = "–";
    localConfEl.textContent = "0%";
    localBarEl.style.width = "0%";

    renderSentence();
  });

  btnLogout.addEventListener("click", logout);

  window.addEventListener("beforeunload", () => {
    try {
      if (peer && !peer.destroyed) peer.destroy();
      if (localStream) localStream.getTracks().forEach(track => track.stop());
    } catch (_) {}
  });
}

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  enableChat(false);
  initAuthGate();
});