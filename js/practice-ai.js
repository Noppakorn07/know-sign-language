import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const startPredictBtn = document.getElementById("startPredictBtn");

const statusText = document.getElementById("statusText");
const detectedWord = document.getElementById("detectedWord");
const confidenceText = document.getElementById("confidenceText");
const sentenceBox = document.getElementById("sentenceBox");

const removeLastBtn = document.getElementById("removeLastBtn");
const clearSentenceBtn = document.getElementById("clearSentenceBtn");

const INPUT_SIZE = 126;
const MODEL_PATH = "./model/ksl-sign-model.json";
const LABEL_PATH = "./model/labels.json";
// ถ้าตอนเก็บข้อมูลท่า 1 มือ ใช้มือขวา ให้ค่านี้เป็น "right"
// ถ้าใช้มือซ้าย ให้เปลี่ยนเป็น "left"
const MAIN_HAND_FOR_ONE_HAND = "right";

let handLandmarker = null;
let model = null;
let labels = [];

let stream = null;
let isDetecting = false;
let lastResult = null;

let sentenceWords = [];
let lastAddedWord = "";
let lastAddedTime = 0;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

async function loadAI() {
  if (handLandmarker && model && labels.length > 0) return;

  statusText.textContent = "กำลังโหลด MediaPipe และโมเดล AI...";

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

  model = await tf.loadLayersModel(MODEL_PATH);

  const labelResponse = await fetch(LABEL_PATH);
  labels = await labelResponse.json();

  statusText.textContent = "โหลด AI สำเร็จ พร้อมเปิดกล้อง";
}

async function startCamera() {
  try {
    await loadAI();

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

      statusText.textContent = "เปิดกล้องแล้ว กดเริ่มตรวจจับ";
      detectLoop();
    };
  } catch (error) {
    console.error(error);
    statusText.textContent = "เปิดกล้องหรือโหลดโมเดลไม่ได้";
    alert("เปิดกล้องหรือโหลดโมเดลไม่ได้ ดู Console เพิ่มเติม");
  }
}

function stopCamera() {
  isDetecting = false;

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  statusText.textContent = "ปิดกล้องแล้ว";
}

function startPredict() {
  if (!stream) {
    alert("กรุณาเปิดกล้องก่อน");
    return;
  }

  isDetecting = true;
  statusText.textContent = "กำลังตรวจจับท่าภาษามือ...";
}

function detectLoop() {
  if (!stream || !handLandmarker) return;

  const result = handLandmarker.detectForVideo(video, performance.now());
  lastResult = result;

  drawResult(result);

  if (isDetecting) {
    predictGesture(result);
  }

  requestAnimationFrame(detectLoop);
}

function drawResult(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!result.landmarks || result.landmarks.length === 0) return;

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
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fillStyle = handedness === "Left" ? "#20c997" : "#3b5bdb";
      ctx.fill();
    });
  });
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

  // ถ้าเห็น 2 มือ ใช้รูปแบบ 2 มือ
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

  // ถ้าเห็น 1 มือ ใช้รูปแบบ 1 มือ และใส่อีกมือเป็น 0
  const detectedHand = hands[0];
  if (!detectedHand) return null;

  const wrist = detectedHand.landmarks[0];
  const indexBase = detectedHand.landmarks[5] || detectedHand.landmarks[0];

  const baseX = wrist.x;
  const baseY = wrist.y;
  const baseZ = wrist.z || 0;

  const scale =
    Math.hypot(indexBase.x - wrist.x, indexBase.y - wrist.y) || 1;

  const offset = MAIN_HAND_FOR_ONE_HAND === "left" ? 0 : 63;

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

function predictGesture(result) {
  if (!model || labels.length === 0) return;

  const vector = landmarksToVector(result);

  if (!vector) {
    detectedWord.textContent = "-";
    confidenceText.textContent = "0%";
    statusText.textContent = "ยังไม่พบมือในกล้อง";
    return;
  }

  const input = tf.tensor2d([vector], [1, INPUT_SIZE]);
  const prediction = model.predict(input);
  const scores = prediction.dataSync();

  input.dispose();
  prediction.dispose();

  let maxIndex = 0;
  let maxScore = scores[0];

  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > maxScore) {
      maxScore = scores[i];
      maxIndex = i;
    }
  }

  const word = labels[maxIndex];
  const confidence = Math.round(maxScore * 100);

  detectedWord.textContent = word;
  confidenceText.textContent = `${confidence}%`;

  if (confidence >= 80) {
    statusText.textContent = `ตรวจพบ "${word}"`;

    addWordToSentence(word, confidence);
  } else {
    statusText.textContent = "ยังไม่มั่นใจ ลองทำท่าให้ชัดขึ้น";
  }
}

function addWordToSentence(word, confidence) {
  const now = Date.now();

  // กันคำเดิมถูกเพิ่มรัว ๆ
  if (word === lastAddedWord && now - lastAddedTime < 2500) {
    return;
  }

  lastAddedWord = word;
  lastAddedTime = now;

  sentenceWords.push(word);
  renderSentence();
}

function renderSentence() {
  if (sentenceWords.length === 0) {
    sentenceBox.textContent = "ยังไม่มีข้อความ";
    return;
  }

  sentenceBox.textContent = sentenceWords.join(" ");
}

function removeLastWord() {
  sentenceWords.pop();
  renderSentence();
}

function clearSentence() {
  sentenceWords = [];
  lastAddedWord = "";
  detectedWord.textContent = "-";
  confidenceText.textContent = "0%";
  renderSentence();
}

startCameraBtn.addEventListener("click", startCamera);
stopCameraBtn.addEventListener("click", stopCamera);
startPredictBtn.addEventListener("click", startPredict);
removeLastBtn.addEventListener("click", removeLastWord);
clearSentenceBtn.addEventListener("click", clearSentence);