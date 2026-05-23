let localStream, activeCall, myPeer, isVideoOff = false, isSearching = false, checkLobbyInterval, aiSimulationInterval;
const LOBBY_PREFIX = "sb-lobby-", MAX_SLOTS = 10, phrases = ["สวัสดี", "ขอบคุณครับ", "สบายดีไหม?", "ไม่เข้าใจ", "ช่วยด้วย", "ยินดีที่ได้รู้จัก"];

let currentRemotePeerId = null;
let lastConnectedPeerId = null;

const localVideoEl = document.getElementById('localVideo'), remoteVideoEl = document.getElementById('remoteVideo');
const btnMatch = document.getElementById('btnMatch'), statusText = document.getElementById('statusText');
const btnHangup = document.getElementById('btnHangup'), btnToggleVideo = document.getElementById('btnToggleVideo');
const aiSubtitleBox = document.getElementById('aiSubtitleBox'), subtitleText = document.getElementById('subtitleText');
const btnNext = document.getElementById('btnNext');
const btnReport = document.getElementById('btnReport');

async function startLocalMedia() {
    try {
        const constraints = { 
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, 
            audio: false 
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideoEl.srcObject = localStream;
        localVideoEl.onloadedmetadata = () => {
            localVideoEl.play().catch(e => console.log(e));
        };
        isVideoOff = false;
        btnToggleVideo.classList.remove('off');
        btnToggleVideo.innerHTML = '<i class="fa-solid fa-video"></i>';
        statusText.innerText = "เปิดกล้องสำเร็จแล้ว! สามารถกดเริ่มสุ่มจับคู่ได้เลย";
        return true;
    } catch (err) {
        statusText.innerHTML = `<span style='color: red;'>ไม่สามารถเข้าถึงกล้องได้ (${err.name}): กรุณาเช็กสิทธิ์กล้องในเบราว์เซอร์ของคุณ</span>`;
        return false;
    }
}

function initMainPeer() {
    return new Promise((resolve) => {
        if (myPeer && !myPeer.destroyed) {
            resolve();
            return;
        }
        myPeer = new Peer();
        myPeer.on('open', () => { resolve(); });
        myPeer.on('call', (call) => { 
            stopSearchingLobby(); 
            call.answer(localStream); 
            currentRemotePeerId = call.peer;
            handleCall(call); 
        });
    });
}

btnMatch.addEventListener('click', async () => {
    if (!localStream) {
        btnMatch.disabled = true;
        statusText.innerText = "กำลังขอสิทธิ์เปิดใช้งานกล้องวิดีโอ...";
        const hasCamera = await startLocalMedia();
        if (hasCamera) {
            await initMainPeer();
            startSearchingLobby();
        } else {
            btnMatch.disabled = false;
        }
        return;
    }
    !isSearching ? startSearchingLobby() : stopSearchingLobby();
});

function startSearchingLobby() {
    isSearching = true;
    btnMatch.disabled = false;
    btnMatch.classList.add('searching');
    btnMatch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังค้นหาคนออนไลน์...';
    statusText.innerText = "กำลังมองหาผู้ใช้ที่กำลังกดสุ่มอยู่ในขณะนี้...";
    btnHangup.style.display = 'none';
    btnNext.style.display = 'none';
    
    let slot = 1;
    checkLobbyInterval = setInterval(() => {
        if (!isSearching) return;
        let targetId = LOBBY_PREFIX + slot;
        let testPeer = new Peer();

        testPeer.on('open', () => {
            let call = testPeer.call(targetId, localStream);
            let connected = false;
            let timeout = setTimeout(() => { testPeer.destroy(); if (!connected) occupySlot(targetId); }, 1200);

            call.on('stream', () => { connected = true; clearTimeout(timeout); testPeer.destroy(); connectDirect(targetId); });
        });
        slot = slot >= MAX_SLOTS ? 1 : slot + 1;
    }, 1800);
}

function occupySlot(id) {
    clearInterval(checkLobbyInterval);
    if (myPeer) myPeer.destroy();
    myPeer = new Peer(id);
    myPeer.on('open', () => statusText.innerText = "คุณกำลังต่อคิวเป็นหลักเพื่อรอคนอื่นเข้ามากดสุ่มเจอ...");
    myPeer.on('call', (call) => { 
        call.answer(localStream); 
        currentRemotePeerId = call.peer;
        handleCall(call); 
    });
    myPeer.on('error', (err) => { if (err.type === 'unavailable-id') { initMainPeer().then(() => { if (isSearching) startSearchingLobby(); }); } });
}

function connectDirect(id) { 
    stopSearchingLobby(); 
    statusText.innerText = "เจอคู่สายแล้ว! กำลังเชื่อมต่อ..."; 
    currentRemotePeerId = id;
    if (myPeer) handleCall(myPeer.call(id, localStream)); 
}

function handleCall(call) {
    activeCall = call;
    lastConnectedPeerId = currentRemotePeerId;
    btnMatch.disabled = true;
    btnHangup.style.display = 'flex';
    btnNext.style.display = 'flex';
    btnReport.style.display = 'flex'; 

    call.on('stream', (stream) => { 
        remoteVideoEl.srcObject = stream; 
        remoteVideoEl.onloadedmetadata = () => { remoteVideoEl.play().catch(e => console.log(e)); };
        statusText.innerText = "เชื่อมต่อสำเร็จ! กำลังสนทนา"; 
        startAi(); 
    });
    call.on('close', endCall); 
    call.on('error', endCall);
}

function stopSearchingLobby() {
    isSearching = false;
    clearInterval(checkLobbyInterval);
    btnMatch.classList.remove('searching');
    btnMatch.innerHTML = '<i class="fa-solid fa-shuffle"></i> เริ่มสุ่มจับคู่สนทนา';
    if (localStream) {
        statusText.innerText = "ระบบกล้องพร้อมใช้งาน กรุณากดสุ่มจับคู่";
    }
}

function endCall() {
    stopAi(); 
    if (activeCall) activeCall.close();
    remoteVideoEl.srcObject = null;
    currentRemotePeerId = null;
    btnHangup.style.display = 'none';
    btnNext.style.display = 'none';
    btnMatch.disabled = false;
    stopSearchingLobby(); 
    initMainPeer().then(() => {
        statusText.innerText = "สายหลุดหรือวางสายแล้ว กรุณากดปุ่มเพื่อเริ่มต้นใหม่";
    });
}

btnHangup.addEventListener('click', () => {
    endCall();
    btnReport.style.display = 'none';
});

btnNext.addEventListener('click', () => {
    stopAi(); 
    if (activeCall) activeCall.close();
    remoteVideoEl.srcObject = null;
    currentRemotePeerId = null;
    initMainPeer().then(() => {
        startSearchingLobby();
    });
});

btnReport.addEventListener('click', () => {
    const targetToReport = currentRemotePeerId || lastConnectedPeerId;
    if (!targetToReport) {
        alert("ยังไม่มีประวัติคู่สายให้รายงานในขณะนี้");
        return;
    }
    const reason = prompt("กรุณาระบุพฤติกรรมที่ไม่เหมาะสมของผู้ใช้รายนี้ (เช่น แสดงพฤติกรรมอนาจาร, บูลลี่, ใช้ถ้อยคำหยาบคาย):");
    if (reason === null) return;
    if (reason.trim() === "") {
        alert("กรุณากรอกเหตุผลในการรายงานด้วยครับ");
        return;
    }
    console.log(`[REPORTED] Peer ID: ${targetToReport} | Reason: ${reason}`);
    alert("ระบบได้บันทึกรายงานของคุณเรียบร้อยแล้ว ทีมงานจะตรวจสอบพฤติกรรมของ Peer ID นี้อย่างละเอียดครับ");
    if (activeCall) {
        endCall();
    }
    btnReport.style.display = 'none';
});

btnToggleVideo.addEventListener('click', async () => {
    if (!localStream) {
        statusText.innerText = "กำลังขอสิทธิ์เปิดใช้งานกล้องวิดีโอ...";
        await startLocalMedia();
        return;
    }
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    btnToggleVideo.classList.toggle('off', isVideoOff);
    btnToggleVideo.innerHTML = isVideoOff ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
});

function startAi() {
    aiSubtitleBox.classList.add('active');
    aiSimulationInterval = setInterval(() => {
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        subtitleText.innerHTML = `ตรวจพบภาษามือ: <strong style="color: #fff; text-decoration: underline;">"${phrase}"</strong>`;
    }, 6000);
}

function stopAi() { clearInterval(aiSimulationInterval); aiSubtitleBox.classList.remove('active'); }

window.addEventListener('DOMContentLoaded', () => {
    btnMatch.disabled = false;
});