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
const btnRemoveLast = document.getElementById("btnRemoveLast");
const btnClearAll = document.getElementById("btnClearAll");

// ─── State ──────────────────────────────────────────────
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

  if (type === "connected") {
    statusBar.classList.add("connected");
  }

  if (type === "error") {
    statusBar.classList.add("error");
  }
}

function setAiChip(html, className = "") {
  aiStatusChip.className = "ai-status-chip" + (className ? " " + className : "");
  aiStatusChip.innerHTML = html;
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

// ─── Media ──────────────────────────────────────────────
async function startLocalMedia() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง", "error");
      alert("กรุณาใช้ Google Chrome และเปิดผ่าน Live Server");
      return false;
    }

    setStatus("กำลังขออนุญาตใช้กล้องและไมค์...");

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
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });

      setStatus("เปิดกล้องได้ แต่ไม่ได้เปิดไมค์");
      btnToggleMic.disabled = true;
    }

    localVideoEl.srcObject = localStream;

    await new Promise(resolve => {
      localVideoEl.onloadedmetadata = resolve;
    });

    await localVideoEl.play().catch(() => {});

    setStatus("เปิดกล้องสำเร็จ กำลังเชื่อมต่อห้อง...");
    return true;

  } catch (error) {
    console.error("Camera error:", error);

    if (error.name === "NotAllowedError") {
      setStatus("ไม่ได้รับอนุญาตให้ใช้กล้อง", "error");
      alert("กรุณากด Allow / อนุญาต Camera บนเบราว์เซอร์");
    } else if (error.name === "NotFoundError") {
      setStatus("ไม่พบกล้อง", "error");
      alert("ไม่พบกล้อง ลองเช็กว่ากล้องใช้งานได้หรือไม่");
    } else if (error.name === "NotReadableError") {
      setStatus("กล้องถูกโปรแกรมอื่นใช้งานอยู่", "error");
      alert("ปิด Zoom / Google Meet / Camera app แล้วลองใหม่");
    } else {
      setStatus("เปิดกล้องไม่ได้: " + error.message, "error");
      alert("เปิดกล้องไม่ได้ ดู Console เพิ่มเติม");
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

  setStatus("กำลังเปิดกล้อง...");

  const mediaOk = await startLocalMedia();

  if (!mediaOk) {
    resetJoinUI();
    return;
  }

  setStatus("กำลังเข้าห้อง...");

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
        try {
          call.close();
        } catch (_) {}

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
    btnHangup.style.display = "flex";
    btnToggleAI.disabled = false;
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

  btnHangup.style.display = "flex";
  btnToggleAI.disabled = false;
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

  setStatus("สายถูกตัดหรือคู่สนทนาออกจากห้อง", "error");
}

function setupDataConnectionAsGuest(roomId) {
  if (!peer) return;

  dataConn = peer.connect(hostId(roomId));

  dataConn.on("open", () => {
    console.log("Data connection opened");
  });

  dataConn.on("data", handleDataMessage);
  dataConn.on("close", () => {
    dataConn = null;
  });
}

function handleIncomingDataConnection(connection) {
  dataConn = connection;

  dataConn.on("data", handleDataMessage);

  dataConn.on("close", () => {
    dataConn = null;
  });
}

function handleDataMessage(data) {
  if (!data || typeof data !== "object") return;

  if (data.type === "sign-word") {
    remoteWord.textContent = `${data.word} (${data.confidence}%)`;
    remoteSubtitle.classList.add("visible");

    setTimeout(() => {
      remoteSubtitle.classList.remove("visible");
    }, 2500);
  }
}

function sendSignWordToPeer(word, confidence) {
  if (!dataConn || !dataConn.open) return;

  dataConn.send({
    type: "sign-word",
    word,
    confidence
  });
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

  setStatus("วางสายแล้ว สามารถเข้าห้องใหม่ได้");
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

  sendSignWordToPeer(word, confidence);
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

// ─── Init ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  prefillRoomFromURL();

  const params = new URLSearchParams(window.location.search);

  if (params.get("room")) {
    setTimeout(() => {
      joinRoom();
    }, 300);
  }
});