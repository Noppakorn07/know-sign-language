/*
  Know Sign Language - Stable Call System
  - สุ่มคอลผ่าน Firestore queue
  - สร้างเลขห้อง 6 หลัก
  - เข้าเลขห้อง 6 หลัก
  - วิดีโอ + ไมค์ เปิด/ปิดได้
  - แชตผ่าน Firestore เพื่อให้เสถียรกว่า DataChannel
*/

const auth = firebase.auth();
const db = firebase.firestore();

// =========================
// CONFIG
// =========================
const ROOM_EXPIRE_MS = 5 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 18000;
const HEARTBEAT_MS = 10000;

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" }
    ],
    iceCandidatePoolSize: 10
  }
};

// =========================
// DOM
// =========================
const $ = (id) => document.getElementById(id);

const navActions = $("navActions");
const userChip = $("userChip");
const btnLogout = $("btnLogout");

const btnRandom = $("btnRandom");
const btnCreateRoom = $("btnCreateRoom");
const btnJoinRoom = $("btnJoinRoom");
const btnCopyLink = $("btnCopyLink");
const roomCodeInput = $("roomCodeInput");
const roomBadge = $("roomBadge");

const statusBar = $("statusBar");
const statusText = $("statusText");

const localVideo = $("localVideo");
const remoteVideo = $("remoteVideo");
const localPlaceholder = $("localPlaceholder");
const remotePlaceholder = $("remotePlaceholder");

const btnToggleMic = $("btnToggleMic");
const btnHangup = $("btnHangup");

const chatStatus = $("chatStatus");
const chatMessages = $("chatMessages");
const chatInput = $("chatInput");
const btnSendChat = $("btnSendChat");

// =========================
// STATE
// =========================
let currentUser = null;
let clientId = sessionStorage.getItem("ksl_call_client_id");

if (!clientId) {
  clientId = "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem("ksl_call_client_id", clientId);
}

let peer = null;
let peerId = "";
let localStream = null;
let activeCall = null;
let activeRoomCode = "";
let activeRole = "";
let micEnabled = false;
let hasMic = false;
let isBusy = false;
let connectedOnce = false;
let connectTimer = null;
let heartbeatTimer = null;

let roomUnsub = null;
let chatUnsub = null;
let presenceRef = null;

// =========================
// UI HELPERS
// =========================
function setStatus(text, type = "") {
  statusText.textContent = text;
  statusBar.className = "status-bar";
  if (type) statusBar.classList.add(type);
}

function setRoom(code) {
  activeRoomCode = code || "";
  roomBadge.innerHTML = `ห้อง: <strong>${code || "-"}</strong>`;
}

function setButtonsBusy(busy) {
  isBusy = busy;
  btnRandom.disabled = busy;
  btnCreateRoom.disabled = busy;
  btnJoinRoom.disabled = busy;
  roomCodeInput.disabled = busy;
}

function getName() {
  return currentUser?.displayName || currentUser?.email || "ผู้ใช้";
}

function resetChat() {
  chatMessages.innerHTML = `<div class="message system">กดสุ่ม หรือสร้างเลขห้องแล้วส่งให้เพื่อน</div>`;
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "message system";
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addChatBubble(name, text, mine) {
  const div = document.createElement("div");
  div.className = `message ${mine ? "me" : "other"}`;

  const nameEl = document.createElement("span");
  nameEl.className = "name";
  nameEl.textContent = mine ? "คุณ" : name;

  const textEl = document.createElement("span");
  textEl.textContent = text;

  div.appendChild(nameEl);
  div.appendChild(textEl);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function enableChat(enabled) {
  chatInput.disabled = !enabled;
  btnSendChat.disabled = !enabled;
  chatStatus.textContent = enabled
    ? "เชื่อมต่อแล้ว พิมพ์ข้อความคุยได้"
    : "ยังไม่ได้เชื่อมต่อคู่สนทนา";
}

function updateMicButton() {
  if (!hasMic) {
    btnToggleMic.disabled = true;
    btnToggleMic.className = "btn-control off";
    btnToggleMic.innerHTML = `<i class="fa-solid fa-microphone-slash"></i> ไม่มีไมค์/ไม่ได้อนุญาต`;
    return;
  }

  btnToggleMic.disabled = false;

  if (micEnabled) {
    btnToggleMic.className = "btn-control on";
    btnToggleMic.innerHTML = `<i class="fa-solid fa-microphone"></i> ไมค์เปิด`;
  } else {
    btnToggleMic.className = "btn-control off";
    btnToggleMic.innerHTML = `<i class="fa-solid fa-microphone-slash"></i> ไมค์ปิด`;
  }
}

function showLocalCameraReady() {
  localPlaceholder.style.display = "none";
}

function showRemoteCameraReady() {
  remotePlaceholder.style.display = "none";
}

function showRemoteWaiting() {
  remotePlaceholder.style.display = "flex";
}

// =========================
// MEDIA + PEER
// =========================
async function startMedia() {
  if (localStream) return localStream;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("เบราว์เซอร์ไม่รองรับกล้อง หรือไม่ได้เปิดผ่าน Live Server");
  }

  setStatus("กำลังขออนุญาตกล้องและไมค์...");

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 },
        facingMode: "user"
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (err) {
    console.warn("เปิดกล้องพร้อมไมค์ไม่ได้ จะลองเปิดเฉพาะกล้อง", err);

    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 },
        facingMode: "user"
      },
      audio: false
    });
  }

  localVideo.srcObject = localStream;
  localVideo.muted = true;
  localVideo.playsInline = true;
  await localVideo.play().catch(() => {});

  const audioTrack = localStream.getAudioTracks()[0];
  hasMic = !!audioTrack;
  micEnabled = !!audioTrack;

  updateMicButton();
  showLocalCameraReady();

  return localStream;
}

function stopMedia() {
  if (!localStream) return;
  localStream.getTracks().forEach((track) => track.stop());
  localStream = null;
  localVideo.srcObject = null;
  localPlaceholder.style.display = "flex";
  hasMic = false;
  micEnabled = false;
  updateMicButton();
}

function toggleMic() {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    hasMic = false;
    micEnabled = false;
    updateMicButton();
    alert("ไม่พบไมค์ หรือยังไม่ได้อนุญาตไมค์");
    return;
  }

  micEnabled = !micEnabled;
  audioTrack.enabled = micEnabled;
  updateMicButton();
}

function createPeer() {
  return new Promise((resolve, reject) => {
    if (peer && !peer.destroyed && peerId) {
      resolve(peerId);
      return;
    }

    destroyPeer();

    const wantedId = "ksl-" + clientId.replace(/[^a-zA-Z0-9_-]/g, "");
    peer = new Peer(wantedId, PEER_CONFIG);

    peer.on("open", (id) => {
      peerId = id;
      resolve(id);
    });

    peer.on("call", async (call) => {
      try {
        await startMedia();
        setupCall(call, false);
        call.answer(localStream);
      } catch (err) {
        console.error("รับสายไม่ได้", err);
        setStatus("รับสายไม่ได้: เปิดกล้อง/ไมค์ไม่สำเร็จ", "error");
      }
    });

    peer.on("disconnected", () => {
      console.warn("Peer disconnected, reconnecting...");
      try { peer.reconnect(); } catch (_) {}
    });

    peer.on("error", (err) => {
      console.error("Peer error", err);

      if (err.type === "unavailable-id") {
        sessionStorage.removeItem("ksl_call_client_id");
        clientId = "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem("ksl_call_client_id", clientId);
        destroyPeer();
        setStatus("รีเซ็ต Peer ID แล้ว กดเริ่มใหม่อีกครั้ง", "error");
      } else if (err.type === "peer-unavailable") {
        setStatus("ไม่พบคู่สนทนา หรืออีกฝั่งปิดหน้าเว็บไปแล้ว", "error");
      } else if (err.type === "network") {
        setStatus("ปัญหาเครือข่าย WebRTC ลองรีเฟรชหรือเปลี่ยนเน็ต", "error");
      } else {
        setStatus("ระบบวิดีโอคอลมีปัญหา: " + (err.type || err.message), "error");
      }
    });
  });
}

function destroyPeer() {
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (_) {}
  }
  peer = null;
  peerId = "";
}

async function prepareCall() {
  await startMedia();
  await createPeer();
  await updatePresence();
}

function setupCall(call, outgoing) {
  if (activeCall && activeCall !== call) {
    try { activeCall.close(); } catch (_) {}
  }

  activeCall = call;
  connectedOnce = false;

  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (!connectedOnce) {
      setStatus("ยังไม่ได้รับภาพจากอีกฝั่ง ลองวางสายแล้วเข้าใหม่ หรืออีกเครือข่ายอาจบล็อก WebRTC", "error");
    }
  }, CONNECT_TIMEOUT_MS);

  call.on("stream", (remoteStream) => {
    connectedOnce = true;
    clearTimeout(connectTimer);

    remoteVideo.srcObject = remoteStream;
    remoteVideo.playsInline = true;
    remoteVideo.play().catch(() => {});

    showRemoteCameraReady();
    onConnected();
  });

  call.on("close", () => {
    if (connectedOnce) addSystemMessage("คู่สนทนาออกจากสายแล้ว");
    endCall(false);
  });

  call.on("error", (err) => {
    console.error("Call error", err);
    setStatus("สายมีปัญหา ลองวางสายแล้วเข้าใหม่", "error");
    endCall(false);
  });

  if (outgoing) {
    setStatus("กำลังโทรหาอีกฝั่ง รอรับภาพ...");
  } else {
    setStatus("มีคนเข้ามา กำลังรับสาย...");
  }
}

function callPeer(hostPeerId) {
  if (!peer || !localStream || !hostPeerId) return;
  const call = peer.call(hostPeerId, localStream, {
    metadata: {
      roomCode: activeRoomCode,
      clientId,
      name: getName()
    }
  });
  setupCall(call, true);
}

function onConnected() {
  setStatus("เชื่อมต่อสำเร็จ กำลังสนทนา", "connected");
  btnHangup.style.display = "inline-flex";
  enableChat(true);
  addSystemMessage("เชื่อมต่อคู่สนทนาแล้ว");
}

// =========================
// FIRESTORE PRESENCE
// =========================
async function updatePresence() {
  if (!currentUser || !peerId) return;

  presenceRef = db.collection("callPresence").doc(clientId);

  await presenceRef.set({
    clientId,
    uid: currentUser.uid,
    name: getName(),
    peerId,
    online: true,
    updatedAtMs: Date.now(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (!presenceRef || !peerId) return;
    presenceRef.set({
      online: true,
      peerId,
      updatedAtMs: Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  }, HEARTBEAT_MS);
}

async function removePresence() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;

  if (presenceRef) {
    await presenceRef.delete().catch(() => {});
    presenceRef = null;
  }
}

// =========================
// ROOM CODE SYSTEM
// =========================
function createRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createUniqueRoomCode() {
  for (let i = 0; i < 20; i++) {
    const code = createRoomCode();
    const snap = await db.collection("callRooms").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new Error("สร้างเลขห้องไม่สำเร็จ");
}

async function createRoom(type = "manual", forcedCode = "") {
  const roomCode = forcedCode || await createUniqueRoomCode();
  const now = Date.now();

  await db.collection("callRooms").doc(roomCode).set({
    roomCode,
    type,
    status: "waiting",
    hostClientId: clientId,
    hostUid: currentUser.uid,
    hostName: getName(),
    hostPeerId: peerId,
    guestClientId: "",
    guestUid: "",
    guestName: "",
    guestPeerId: "",
    createdAtMs: now,
    updatedAtMs: now,
    expiresAtMs: now + ROOM_EXPIRE_MS,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  activeRole = "host";
  setRoom(roomCode);
  listenRoom(roomCode);
  listenChat(roomCode);
  return roomCode;
}

async function handleCreateRoom() {
  if (isBusy) return;

  try {
    setButtonsBusy(true);
    resetChat();
    setStatus("กำลังสร้างห้อง...");

    await prepareCall();
    const code = await createRoom("manual");

    roomCodeInput.value = code;
    setStatus(`สร้างห้อง ${code} แล้ว ส่งเลขนี้ให้เพื่อน`);
    addSystemMessage(`สร้างห้อง ${code} แล้ว รอเพื่อนเข้าเลขห้อง`);
    btnHangup.style.display = "inline-flex";
  } catch (err) {
    console.error(err);
    setStatus("สร้างห้องไม่สำเร็จ: " + err.message, "error");
    setButtonsBusy(false);
  }
}

async function handleJoinRoom() {
  if (isBusy) return;

  const code = roomCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    alert("กรุณากรอกเลขห้อง 6 หลัก");
    return;
  }

  try {
    setButtonsBusy(true);
    resetChat();
    setStatus("กำลังเข้าเลขห้อง...");

    await prepareCall();

    const roomRef = db.collection("callRooms").doc(code);
    const roomSnap = await roomRef.get();

    if (!roomSnap.exists) {
      alert("ไม่พบเลขห้องนี้");
      setStatus("ไม่พบเลขห้องนี้", "error");
      setButtonsBusy(false);
      return;
    }

    const room = roomSnap.data();

    if (room.status === "ended") {
      alert("ห้องนี้ปิดไปแล้ว");
      setButtonsBusy(false);
      return;
    }

    if (room.hostClientId === clientId) {
      alert("นี่คือห้องของเครื่องนี้ ให้เอาเลขไปกรอกในอีกเครื่องหนึ่ง");
      setButtonsBusy(false);
      return;
    }

    if (!room.hostPeerId) {
      alert("ห้องนี้ยังไม่พร้อม ลองให้เจ้าของห้องสร้างใหม่");
      setButtonsBusy(false);
      return;
    }

    if (room.status === "matched" && room.guestClientId && room.guestClientId !== clientId) {
      alert("ห้องนี้มีคนเข้าแล้ว");
      setButtonsBusy(false);
      return;
    }

    await roomRef.update({
      status: "matched",
      guestClientId: clientId,
      guestUid: currentUser.uid,
      guestName: getName(),
      guestPeerId: peerId,
      updatedAtMs: Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    activeRole = "guest";
    setRoom(code);
    listenRoom(code);
    listenChat(code);
    btnHangup.style.display = "inline-flex";

    addSystemMessage(`เข้าห้อง ${code} แล้ว กำลังเชื่อมต่อ...`);
    callPeer(room.hostPeerId);
  } catch (err) {
    console.error(err);
    setStatus("เข้าเลขห้องไม่สำเร็จ: " + err.message, "error");
    setButtonsBusy(false);
  }
}

function listenRoom(code) {
  if (roomUnsub) roomUnsub();

  roomUnsub = db.collection("callRooms").doc(code).onSnapshot((doc) => {
    if (!doc.exists) return;
    const room = doc.data();

    if (room.status === "matched") {
      if (activeRole === "host" && room.guestName) {
        setStatus(`${room.guestName} เข้าห้องแล้ว รอรับภาพ...`);
      }
    }

    if (room.status === "ended") {
      if (activeRoomCode) addSystemMessage("ห้องถูกปิดแล้ว");
      endCall(false);
    }
  }, (err) => {
    console.error(err);
    setStatus("อ่านข้อมูลห้องไม่ได้: " + err.message, "error");
  });
}

function copyRoomLink() {
  const code = activeRoomCode || roomCodeInput.value.trim();

  if (!code) {
    alert("ยังไม่มีเลขห้อง");
    return;
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", code);

  navigator.clipboard.writeText(url.toString()).then(() => {
    btnCopyLink.innerHTML = `<i class="fa-solid fa-check"></i> คัดลอกแล้ว`;
    setTimeout(() => {
      btnCopyLink.innerHTML = `<i class="fa-solid fa-copy"></i> คัดลอกลิงก์`;
    }, 1600);
  }).catch(() => {
    alert("คัดลอกไม่ได้ ให้คัดลอกเลขห้องแทน: " + code);
  });
}

function prefillRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("room");
  if (/^\d{6}$/.test(code || "")) {
    roomCodeInput.value = code;
    setRoom(code);
  }
}

// =========================
// RANDOM MATCHMAKING
// =========================
async function handleRandom() {
  if (isBusy) return;

  try {
    setButtonsBusy(true);
    resetChat();
    setRoom("");
    roomCodeInput.value = "";

    setStatus("กำลังเตรียมกล้องและไมค์...");
    await prepareCall();

    setStatus("กำลังสุ่มหาคู่สนทนา...");

    const queueRef = db.collection("randomQueue").doc("current");
    const result = await db.runTransaction(async (tx) => {
      const now = Date.now();
      const queueSnap = await tx.get(queueRef);

      if (queueSnap.exists) {
        const waiting = queueSnap.data();
        const valid =
          waiting &&
          waiting.roomCode &&
          waiting.hostPeerId &&
          waiting.hostClientId !== clientId &&
          waiting.expiresAtMs &&
          waiting.expiresAtMs > now;

        if (valid) {
          const roomRef = db.collection("callRooms").doc(waiting.roomCode);
          const roomSnap = await tx.get(roomRef);

          if (roomSnap.exists && roomSnap.data().status === "waiting") {
            tx.update(roomRef, {
              status: "matched",
              guestClientId: clientId,
              guestUid: currentUser.uid,
              guestName: getName(),
              guestPeerId: peerId,
              updatedAtMs: now,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            tx.delete(queueRef);

            return {
              role: "guest",
              roomCode: waiting.roomCode,
              hostPeerId: waiting.hostPeerId
            };
          }
        }
      }

      const roomCode = createRoomCode();
      const roomRef = db.collection("callRooms").doc(roomCode);

      tx.set(roomRef, {
        roomCode,
        type: "random",
        status: "waiting",
        hostClientId: clientId,
        hostUid: currentUser.uid,
        hostName: getName(),
        hostPeerId: peerId,
        guestClientId: "",
        guestUid: "",
        guestName: "",
        guestPeerId: "",
        createdAtMs: now,
        updatedAtMs: now,
        expiresAtMs: now + ROOM_EXPIRE_MS,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      tx.set(queueRef, {
        roomCode,
        hostClientId: clientId,
        hostUid: currentUser.uid,
        hostName: getName(),
        hostPeerId: peerId,
        createdAtMs: now,
        expiresAtMs: now + ROOM_EXPIRE_MS,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      return {
        role: "host",
        roomCode
      };
    });

    if (result.role === "host") {
      activeRole = "host";
      setRoom(result.roomCode);
      roomCodeInput.value = result.roomCode;
      listenRoom(result.roomCode);
      listenChat(result.roomCode);
      btnHangup.style.display = "inline-flex";
      setStatus("กำลังรอคนอื่นกดสุ่มมาเจอคุณ...");
      addSystemMessage("กำลังรอคู่สนทนา ถ้าอีกเครื่องกดสุ่มจะเชื่อมต่อให้อัตโนมัติ");
      return;
    }

    if (result.role === "guest") {
      activeRole = "guest";
      setRoom(result.roomCode);
      roomCodeInput.value = result.roomCode;
      listenRoom(result.roomCode);
      listenChat(result.roomCode);
      btnHangup.style.display = "inline-flex";
      addSystemMessage("เจอคู่สนทนาแล้ว กำลังเชื่อมต่อ...");
      callPeer(result.hostPeerId);
    }
  } catch (err) {
    console.error(err);
    setStatus("สุ่มคอลไม่สำเร็จ: " + err.message, "error");
    setButtonsBusy(false);
  }
}

// =========================
// CHAT
// =========================
function listenChat(code) {
  if (chatUnsub) chatUnsub();

  chatUnsub = db.collection("callRooms")
    .doc(code)
    .collection("messages")
    .orderBy("createdAtMs", "asc")
    .onSnapshot((snap) => {
      chatMessages.innerHTML = "";

      if (snap.empty) {
        addSystemMessage("เริ่มแชตได้เลย");
        return;
      }

      snap.forEach((doc) => {
        const msg = doc.data();
        addChatBubble(msg.senderName || "คู่สนทนา", msg.text || "", msg.senderClientId === clientId);
      });
    }, (err) => {
      console.error(err);
      addSystemMessage("โหลดแชตไม่ได้: " + err.message);
    });
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !activeRoomCode) return;

  chatInput.value = "";

  await db.collection("callRooms")
    .doc(activeRoomCode)
    .collection("messages")
    .add({
      text,
      senderClientId: clientId,
      senderUid: currentUser.uid,
      senderName: getName(),
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .catch((err) => {
      console.error(err);
      addSystemMessage("ส่งข้อความไม่ได้: " + err.message);
    });
}

// =========================
// END CALL / CLEANUP
// =========================
async function endCall(updateRoom = true) {
  clearTimeout(connectTimer);
  connectTimer = null;

  if (activeCall) {
    try { activeCall.close(); } catch (_) {}
    activeCall = null;
  }

  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
    remoteVideo.srcObject = null;
  }

  showRemoteWaiting();
  enableChat(false);

  const oldRoomCode = activeRoomCode;

  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }

  if (chatUnsub) {
    chatUnsub();
    chatUnsub = null;
  }

  if (updateRoom && oldRoomCode) {
    await db.collection("callRooms").doc(oldRoomCode).set({
      status: "ended",
      endedByClientId: clientId,
      endedAtMs: Date.now(),
      endedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  }

  await removeFromRandomQueue(oldRoomCode);

  setRoom("");
  activeRole = "";
  connectedOnce = false;

  setButtonsBusy(false);
  btnHangup.style.display = "none";
  resetChat();
  setStatus("สายสิ้นสุดแล้ว กดสุ่มหรือสร้างห้องใหม่ได้");
}

async function removeFromRandomQueue(roomCode = "") {
  try {
    const queueRef = db.collection("randomQueue").doc("current");
    const snap = await queueRef.get();
    if (!snap.exists) return;

    const data = snap.data();
    if (data.hostClientId === clientId || data.roomCode === roomCode) {
      await queueRef.delete();
    }
  } catch (_) {}
}

async function cleanupOnLogout() {
  await endCall(true).catch(() => {});
  await removePresence();
  stopMedia();
  destroyPeer();
}

// =========================
// EVENTS
// =========================
btnRandom.addEventListener("click", handleRandom);
btnCreateRoom.addEventListener("click", handleCreateRoom);
btnJoinRoom.addEventListener("click", handleJoinRoom);
btnCopyLink.addEventListener("click", copyRoomLink);
btnToggleMic.addEventListener("click", toggleMic);
btnHangup.addEventListener("click", () => endCall(true));

btnSendChat.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendChat();
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.replace(/\D/g, "").slice(0, 6);
});

roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleJoinRoom();
});

btnLogout.addEventListener("click", async () => {
  await cleanupOnLogout();
  await auth.signOut();
  location.href = "login.html";
});

window.addEventListener("beforeunload", () => {
  try {
    if (activeCall) activeCall.close();
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    if (peer && !peer.destroyed) peer.destroy();
  } catch (_) {}
});

// =========================
// AUTH INIT
// =========================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    userChip.textContent = "ยังไม่ได้เข้าสู่ระบบ";
    btnLogout.style.display = "none";
    setStatus("กรุณาเข้าสู่ระบบก่อนใช้งาน", "error");
    setButtonsBusy(true);
    navActions.innerHTML = `<a class="btn-soft" href="login.html">เข้าสู่ระบบ</a>`;
    return;
  }

  currentUser = user;
  userChip.textContent = user.email || "ผู้ใช้งาน";
  btnLogout.style.display = "inline-flex";
  navActions.innerHTML = `<a class="btn-soft" href="dashboard.html">แดชบอร์ด</a>`;

  setButtonsBusy(false);
  setStatus("พร้อมใช้งาน กดสุ่ม หรือสร้างเลขห้องได้เลย");
  prefillRoomFromUrl();
  updateMicButton();
});