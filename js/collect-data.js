import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const recordBtn = document.getElementById("recordBtn");
const autoRecordBtn = document.getElementById("autoRecordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const downloadDatasetBtn = document.getElementById("downloadDatasetBtn");

const labelSelect = document.getElementById("labelSelect");
const handModeSelect = document.getElementById("handModeSelect");
const mainHandSelect = document.getElementById("mainHandSelect");

const statusText = document.getElementById("statusText");
const sampleCount = document.getElementById("sampleCount");
const handCountText = document.getElementById("handCountText");

const INPUT_SIZE = 126;

let handLandmarker = null;
let stream = null;
let lastResult = null;
let dataset = [];
let autoRecordTimer = null;
let isDetecting = false;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

async function initMediaPipe() {
  if (handLandmarker) return;

  statusText.textContent = "กำลังโหลด MediaPipe Hands...";

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

  statusText.textContent = "โหลด MediaPipe สำเร็จ";
}

async function startCamera() {
  try {
    if (stream) {
      statusText.textContent = "กล้องเปิดอยู่แล้ว";
      return;
    }

    statusText.textContent = "กำลังขออนุญาตเปิดกล้อง...";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.textContent = "เบราว์เซอร์นี้ไม่รองรับกล้อง";
      alert("กรุณาใช้ Google Chrome และเปิดผ่าน Live Server");
      return;
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 640,
        height: 480,
        facingMode: "user"
      },
      audio: false
    });

    video.srcObject = stream;

    video.onloadedmetadata = async () => {
      await video.play();

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      await initMediaPipe();

      isDetecting = true;
      statusText.textContent = "พร้อมเก็บข้อมูลแล้ว วางมือในกล้อง";
      detectLoop();
    };

  } catch (error) {
    console.error("Camera error:", error);

    if (error.name === "NotAllowedError") {
      statusText.textContent = "ไม่ได้รับอนุญาตให้ใช้กล้อง";
      alert("ให้กด Allow / อนุญาต Camera ในเบราว์เซอร์");
    } else if (error.name === "NotFoundError") {
      statusText.textContent = "ไม่พบกล้อง";
      alert("ไม่พบกล้อง ลองเช็กกล้องของเครื่องก่อน");
    } else if (error.name === "NotReadableError") {
      statusText.textContent = "กล้องถูกใช้งานอยู่";
      alert("ปิด Zoom / Google Meet / Camera app แล้วลองใหม่");
    } else {
      statusText.textContent = "เปิดกล้องไม่ได้: " + error.message;
      alert("เปิดกล้องไม่ได้ ดู error ใน Console");
    }
  }
}

function stopCamera() {
  isDetecting = false;

  if (autoRecordTimer) {
    clearInterval(autoRecordTimer);
    autoRecordTimer = null;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;

  if (canvas.width && canvas.height) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  handCountText.textContent = "0";
  statusText.textContent = "ปิดกล้องแล้ว";
}

function detectLoop() {
  if (!isDetecting || !stream || !handLandmarker) return;

  try {
    const result = handLandmarker.detectForVideo(video, performance.now());
    lastResult = result;

    const handCount = result.landmarks ? result.landmarks.length : 0;
    handCountText.textContent = handCount;

    const handMode = handModeSelect.value;

    if (handMode === "one") {
      statusText.textContent =
        handCount >= 1
          ? "ตรวจพบมือแล้ว พร้อมบันทึกท่า 1 มือ"
          : "ท่า 1 มือ: กรุณาวางมือในกล้อง";
    } else {
      statusText.textContent =
        handCount >= 2
          ? "ตรวจพบมือครบ 2 ข้าง พร้อมบันทึกท่า 2 มือ"
          : "ท่า 2 มือ: ต้องเห็นมือครบ 2 ข้างก่อนบันทึก";
    }

    drawResult(result);
  } catch (error) {
    console.error("Detect error:", error);
  }

  requestAnimationFrame(detectLoop);
}

function drawResult(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!result.landmarks || result.landmarks.length === 0) {
    return;
  }

  result.landmarks.forEach((hand, handIndex) => {
    const handedness =
      result.handednesses?.[handIndex]?.[0]?.categoryName || "Hand";

    HAND_CONNECTIONS.forEach(([start, end]) => {
      const a = hand[start];
      const b = hand[end];

      ctx.beginPath();
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = handedness === "Left" ? "#20c997" : "#3b5bdb";
      ctx.stroke();
    });

    hand.forEach(point => {
      ctx.beginPath();
      ctx.arc(
        point.x * canvas.width,
        point.y * canvas.height,
        5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = handedness === "Left" ? "#20c997" : "#3b5bdb";
      ctx.fill();
    });

    const wrist = hand[0];
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(
      handedness,
      wrist.x * canvas.width + 10,
      wrist.y * canvas.height - 10
    );
  });
}

function landmarksToVector(result, handMode, mainHand) {
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

  if (handMode === "two") {
    if (!leftHand || !rightHand) {
      return null;
    }

    const leftWrist = leftHand.landmarks[0];
    const rightWrist = rightHand.landmarks[0];

    const baseX = (leftWrist.x + rightWrist.x) / 2;
    const baseY = (leftWrist.y + rightWrist.y) / 2;
    const baseZ = ((leftWrist.z || 0) + (rightWrist.z || 0)) / 2;

    const scale =
      Math.hypot(
        leftWrist.x - rightWrist.x,
        leftWrist.y - rightWrist.y
      ) || 1;

    writeHandToVector(vector, leftHand, 0, baseX, baseY, baseZ, scale);
    writeHandToVector(vector, rightHand, 63, baseX, baseY, baseZ, scale);

    return vector;
  }

  if (handMode === "one") {
    const detectedHand = hands[0];

    if (!detectedHand) return null;

    const wrist = detectedHand.landmarks[0];
    const indexBase = detectedHand.landmarks[5] || detectedHand.landmarks[0];

    const baseX = wrist.x;
    const baseY = wrist.y;
    const baseZ = wrist.z || 0;

    const scale =
      Math.hypot(
        indexBase.x - wrist.x,
        indexBase.y - wrist.y
      ) || 1;

    const offset = mainHand === "left" ? 0 : 63;

    writeHandToVector(
      vector,
      detectedHand,
      offset,
      baseX,
      baseY,
      baseZ,
      scale
    );

    return vector;
  }

  return null;
}

function writeHandToVector(vector, hand, offset, baseX, baseY, baseZ, scale) {
  hand.landmarks.forEach((point, index) => {
    vector[offset + index * 3] = (point.x - baseX) / scale;
    vector[offset + index * 3 + 1] = (point.y - baseY) / scale;
    vector[offset + index * 3 + 2] =
      ((point.z || 0) - baseZ) / scale;
  });
}

function recordSample() {
  if (!stream) {
    alert("กรุณาเปิดกล้องก่อน");
    return;
  }

  if (!lastResult || !lastResult.landmarks || lastResult.landmarks.length === 0) {
    statusText.textContent = "ยังไม่พบมือ กรุณาวางมือในกล้อง";
    return;
  }

  const label = labelSelect.value;
  const handMode = handModeSelect.value;
  const mainHand = mainHandSelect.value;
  const handCount = lastResult.landmarks ? lastResult.landmarks.length : 0;

  if (handMode === "one" && handCount < 1) {
    statusText.textContent = "ท่า 1 มือ: กรุณาวางมือในกล้องก่อน";
    return;
  }

  if (handMode === "two" && handCount < 2) {
    statusText.textContent = "ท่า 2 มือ: ต้องเห็นมือครบ 2 ข้างก่อนบันทึก";
    return;
  }

  const vector = landmarksToVector(lastResult, handMode, mainHand);

  if (!vector || vector.length !== INPUT_SIZE) {
    statusText.textContent = "ยังเก็บข้อมูลไม่ได้ ลองวางมือให้ชัดขึ้น";
    return;
  }

  dataset.push({
    label: label,
    vector: vector,
    handMode: handMode,
    mainHand: handMode === "one" ? mainHand : "both",
    handsDetected: handCount,
    inputSize: INPUT_SIZE,
    createdAt: new Date().toISOString()
  });

  sampleCount.textContent = dataset.length;

  statusText.textContent =
    `บันทึก "${label}" แล้ว รวม ${dataset.length} ตัวอย่าง`;
}

function startAutoRecord() {
  if (!stream) {
    alert("กรุณาเปิดกล้องก่อน");
    return;
  }

  if (autoRecordTimer) {
    statusText.textContent = "กำลังบันทึกอัตโนมัติอยู่แล้ว";
    return;
  }

  statusText.textContent = "กำลังบันทึกอัตโนมัติ ทุก 0.8 วินาที";

  autoRecordTimer = setInterval(() => {
    recordSample();
  }, 800);
}

function stopAutoRecord() {
  if (autoRecordTimer) {
    clearInterval(autoRecordTimer);
    autoRecordTimer = null;
  }

  statusText.textContent = "หยุดบันทึกอัตโนมัติแล้ว";
}

function downloadDataset() {
  if (dataset.length === 0) {
    alert("ยังไม่มีข้อมูลให้ดาวน์โหลด");
    return;
  }

  const blob = new Blob([JSON.stringify(dataset, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "ksl-dataset-mixed-hands.json";
  a.click();

  URL.revokeObjectURL(url);
}

startCameraBtn.addEventListener("click", startCamera);
stopCameraBtn.addEventListener("click", stopCamera);
recordBtn.addEventListener("click", recordSample);
autoRecordBtn.addEventListener("click", startAutoRecord);
stopRecordBtn.addEventListener("click", stopAutoRecord);
downloadDatasetBtn.addEventListener("click", downloadDataset);