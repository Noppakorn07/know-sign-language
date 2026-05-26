import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// ─── AI Config ───────────────────────────────────────────
const MODEL_PATH = "./model/ksl-sign-model.json";
const LABEL_PATH = "./model/labels.json";
const INPUT_SIZE = 126;
const CONF_THRESHOLD = 0.8;
const COOLDOWN_MS = 2500;
const MAIN_HAND = "right";

// ─── PeerJS Config ───────────────────────────────────────
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

// ─── DOM ────────────────────────────────────────────────
const navActions = document.getElementById("navActions");
const userChip = document.getElementById("userChip");
const btnLogout = document.getElementById("btnLogout");

const roomInput = document.getElementById("roomInput");
const btnJoin = document.getElementById("btnJoin");
const btnCopyLink = document.getElementById("btnCopyLink");

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
const btnToggleMic = document.getElementById("btnToggleMic");
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

// ─── State ──────────────────────────────────────────────
let currentUser = null;

let localStream = null;
let peer = null;
let activeCall = null;
let dataConn = null;

let currentRoomId = "";
let isHost = false;

let isVideoOff = false;
let isMicOff = false;

let handLandmarker = null;
let tfModel = null;
let labels = [];
let aiLoaded = false;
let isAiOn = false;
let detectingAI = false;

let sentenceWords = [];
let lastAddedWord = "";
let lastAddedTime = 0;

// ─── Utils ──────────────────────────────────────────────
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

function hostId(roomId) {
  return `ksl-room-${roomId}-host`;
}

function guestId(roomId) {
  return `ksl-room-${roomId}-guest`;
}

function getRoomFromInput(raw) {
  let roomId = raw.trim();

  try {
    const url = new URL(roomId);
    const value = url.searchParams.get("room");
    if (value) roomId = value;
  } catch (_) {}

  return roomId;
}

function prefillRoomFromURL() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");

  if (room) {
    roomInput.value = room;
  }
}

function enableChat(enabled) {
  chatInput.disabled = !enabled;
  btnSendChat.disabled = !enabled;
  chatStatus.textContent = enabled
    ? "เชื่อมต่อแล้ว พิมพ์ข้อความตอบกลับได้"
    : "ยังไม่ได้เชื่อมต่อคู่สนทนา";
}

// ─── Auth ───────────────────────────────────────────────
function initAuthGate() {
  if (!window.firebase || !firebase.auth) {
    currentUser = {
      displayName: "Guest",
      email: "guest"
    };

    userChip.textContent = "Guest mode";
    navActions.innerHTML = `
      <a class="btn-soft" href="login.html">เข้าสู่ระบบ</a>
      <a class="btn-call" href="register.html">สมัครสมาชิก</a>
    `;

    setStatus("โหมด Guest: พิมพ์ Room ID แล้วกดเข้าร่วม");
    initPage();
    return;
  }

  firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      const redirect = encodeURIComponent("call.html" + window.location.search);
      window.location.href = `login.html?redirect=${redirect}`;
      return;
    }

    currentUser = user;

    const name = getDisplayName();
    userChip.textContent = `เข้าสู่ระบบ: ${name}`;
    btnLogout.style.display = "inline-flex";

    navActions.innerHTML = `
      <a class="btn-soft" href="dashboard.html">แดชบอร์ด</a>
    `;

    setStatus("เข้าสู่ระบบแล้ว พิมพ์ Room ID แล้วกดเข้าร่วม");
    initPage();
  });
}

async function logout() {
  if (window.firebase && firebase.auth) {
    await firebase.auth().signOut();
  }
}

// ─── Media ──────────────────────────────────────────────
async function startLocalMedia() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("เบราว์เซอร์นี้ไม่รองรับกล้อง หรือไม่ได้เปิดผ่าน Live Server", "error");
      alert("ต้องเปิดผ่าน Live Server เช่น http://127.0.0.1:5500/call.html");
      return false;
    }

    setStatus("กำลังขออนุญาตใช้กล้อง...");

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: true
      });
    } catch (firstError) {
      console.warn("เปิดกล้องพร้อมไมค์ไม่ได้ ลองเปิดเฉพาะกล้อง:", firstError);

      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });

      btnToggleMic.disabled = true;
      btnToggleMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> ไม่มีไมค์';
    }

    localVideoEl.srcObject = localStream;
    localVideoEl.muted = true;
    localVideoEl.playsInline = true;

    await localVideoEl.play().catch(() => {});

    setStatus("เปิดกล้องสำเร็จ กำลังเชื่อมต่อห้อง...");
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

function toggleMic() {
  if (!localStream) return;

  const audioTracks = localStream.getAudioTracks();

  if (audioTracks.length === 0) {
    alert("สตรีมนี้ไม่มีไมค์ ใช้งานเฉพาะกล้องอยู่");
    return;
  }

  isMicOff = !isMicOff;

  audioTracks.forEach(track => {
    track.enabled = !isMicOff;
  });

  btnToggleMic.innerHTML = isMicOff
    ? '<i class="fa-solid fa-microphone-slash"></i> ไมค์ (ปิด)'
    : '<i class="fa-solid fa-microphone"></i> ไมค์';

  btnToggleMic.className = isMicOff ? "ctrl-btn danger" : "ctrl-btn secondary";
}

// ─── Room / Call ────────────────────────────────────────
async function joinRoom() {
  const raw = roomInput.value.trim();

  if (!raw) {
    alert("กรุณาพิมพ์ Room ID ก่อน");
    return;
  }

  if (!window.Peer) {
    alert("PeerJS ยังไม่โหลด กรุณาเช็กอินเทอร์เน็ต");
    setStatus("PeerJS โหลดไม่สำเร็จ", "error");
    return;
  }

  currentRoomId = getRoomFromInput(raw);

  btnJoin.disabled = true;
  roomInput.disabled = true;

  const mediaOk = await startLocalMedia();

  if (!mediaOk) {
    resetJoinUI();
    return;
  }

  addSystemMessage(`เข้าห้อง: ${currentRoomId}`);
  connectAsGuest(currentRoomId);
}

function connectAsGuest(roomId) {
  destroyPeer();

  isHost = false;
  peer = new window.Peer(guestId(roomId), PEER_CONFIG);

  peer.on("open", () => {
    setStatus("กำลังลองเชื่อมต่อกับเจ้าของห้อง...");

    const call = peer.call(hostId(roomId), localStream);
    let connected = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        try { call.close(); } catch (_) {}
        becomeHost(roomId);
      }
    }, 4000);

    call.on("stream", remoteStream => {
      connected = true;
      clearTimeout(timeout);

      setupDataConnectionAsGuest(roomId);
      handleCallEstablished(call, remoteStream);
    });

    call.on("error", () => {
      clearTimeout(timeout);
      becomeHost(roomId);
    });

    call.on("close", () => {
      if (connected) handleCallEnded();
    });
  });

  peer.on("call", handleIncomingCall);
  peer.on("connection", handleIncomingDataConnection);

  peer.on("error", error => {
    if (error.type === "unavailable-id") {
      const altId = `${guestId(roomId)}-${Date.now()}`;
      destroyPeer();

      peer = new window.Peer(altId, PEER_CONFIG);

      peer.on("open", () => {
        const call = peer.call(hostId(roomId), localStream);

        call.on("stream", remoteStream => {
          setupDataConnectionAsGuest(roomId);
          handleCallEstablished(call, remoteStream);
        });

        call.on("error", () => becomeHost(roomId));
      });

      peer.on("call", handleIncomingCall);
      peer.on("connection", handleIncomingDataConnection);
      peer.on("error", handlePeerError);

    } else if (error.type === "peer-unavailable") {
      becomeHost(roomId);
    } else {
      handlePeerError(error);
    }
  });
}

function becomeHost(roomId) {
  destroyPeer();

  isHost = true;
  peer = new window.Peer(hostId(roomId), PEER_CONFIG);

  peer.on("open", () => {
    setStatus("คุณเป็นเจ้าของห้อง รอคู่สนทนาเข้าร่วม...");
    btnHangup.style.display = "inline-flex";
    btnToggleAI.disabled = false;
    addSystemMessage("สร้างห้องแล้ว รอเพื่อนเข้าร่วม");
  });

  peer.on("call", handleIncomingCall);
  peer.on("connection", handleIncomingDataConnection);

  peer.on("error", error => {
    if (error.type === "unavailable-id") {
      connectAsGuest(roomId);
    } else {
      handlePeerError(error);
    }
  });
}

function handleIncomingCall(call) {
  call.answer(localStream);

  call.on("stream", remoteStream => {
    handleCallEstablished(call, remoteStream);
  });

  call.on("close", handleCallEnded);
  call.on("error", handleCallEnded);
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
    activeCall.close();
    activeCall = null;
  }

  if (dataConn) {
    dataConn.close();
    dataConn = null;
  }

  remoteVideoEl.srcObject = null;
  remotePlaceholder.style.display = "flex";
  remoteSubtitle.classList.remove("visible");

  enableChat(false);
  setStatus("สายถูกตัดหรือคู่สนทนาออกจากห้อง", "error");
  addSystemMessage("คู่สนทนาออกจากห้องแล้ว");
}

function setupDataConnectionAsGuest(roomId) {
  if (!peer) return;

  dataConn = peer.connect(hostId(roomId));

  dataConn.on("open", () => {
    console.log("Data connection opened");
    sendData({
      type: "hello",
      name: getDisplayName()
    });
  });

  dataConn.on("data", handleDataMessage);
  dataConn.on("close", () => {
    dataConn = null;
  });
}

function handleIncomingDataConnection(connection) {
  dataConn = connection;

  dataConn.on("open", () => {
    sendData({
      type: "hello",
      name: getDisplayName()
    });
  });

  dataConn.on("data", handleDataMessage);

  dataConn.on("close", () => {
    dataConn = null;
  });
}

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

  if (data.type === "sign-word") {
    remoteWord.textContent = `${data.word} (${data.confidence}%)`;
    remoteSubtitle.classList.add("visible");

    setTimeout(() => {
      remoteSubtitle.classList.remove("visible");
    }, 2500);
  }

  if (data.type === "sentence") {
    addChatMessage(data.senderName || "คู่สนทนา", data.text, "other");
  }
}

function handlePeerError(error) {
  console.error("[PeerJS Error]", error);

  const messageMap = {
    network: "ปัญหาเครือข่าย กรุณาตรวจสอบอินเทอร์เน็ต",
    "peer-unavailable": "ยังไม่พบคู่สนทนา",
    disconnected: "การเชื่อมต่อถูกตัด",
    "server-error": "เซิร์ฟเวอร์ PeerJS มีปัญหา",
    "unavailable-id": "ห้องนี้มีผู้ใช้งานอยู่แล้ว"
  };

  setStatus(messageMap[error.type] || "เกิดข้อผิดพลาด: " + error.type, "error");
}

function hangup() {
  stopAI();

  if (activeCall) {
    activeCall.close();
    activeCall = null;
  }

  if (dataConn) {
    dataConn.close();
    dataConn = null;
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
  setStatus("วางสายแล้ว สามารถเข้าห้องใหม่ได้");
  addSystemMessage("วางสายแล้ว");

  resetJoinUI();

  currentRoomId = "";
}

function destroyPeer() {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }

  peer = null;
}

function resetJoinUI() {
  btnJoin.disabled = false;
  roomInput.disabled = false;
}

// ─── Chat ───────────────────────────────────────────────
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

// ─── AI Load ────────────────────────────────────────────
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
    alert("กรุณาเข้าร่วมห้องและเปิดกล้องก่อน");
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

// ─── AI Predict Loop ────────────────────────────────────
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

// ─── Landmarks to Vector 126 ─────────────────────────────
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

// ─── Sentence ────────────────────────────────────────────
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

// ─── Copy Link ───────────────────────────────────────────
function copyRoomLink() {
  const raw = roomInput.value.trim();

  if (!raw) {
    alert("พิมพ์ Room ID ก่อนคัดลอกลิงก์");
    return;
  }

  const roomId = getRoomFromInput(raw);
  const url = new URL(window.location.href);

  url.search = "";
  url.searchParams.set("room", roomId);

  navigator.clipboard.writeText(url.toString()).then(() => {
    btnCopyLink.innerHTML = '<i class="fa-solid fa-check"></i> คัดลอกแล้ว';

    setTimeout(() => {
      btnCopyLink.innerHTML = '<i class="fa-solid fa-copy"></i> คัดลอกลิงก์';
    }, 1800);
  });
}

// ─── Events ─────────────────────────────────────────────
function bindEvents() {
  btnJoin.addEventListener("click", joinRoom);

  roomInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      joinRoom();
    }
  });

  btnCopyLink.addEventListener("click", copyRoomLink);

  btnToggleVideo.addEventListener("click", toggleVideo);
  btnToggleMic.addEventListener("click", toggleMic);
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
}

function initPage() {
  prefillRoomFromURL();
  enableChat(false);
}

// ─── Init ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initAuthGate();
});