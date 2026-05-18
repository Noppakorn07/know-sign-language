const camera = document.getElementById('camera');
const placeholder = document.getElementById('cameraPlaceholder');
const result = document.getElementById('detectResult');
const startBtn = document.getElementById('startCameraBtn');
const stopBtn = document.getElementById('stopCameraBtn');
const mockBtn = document.getElementById('mockDetectBtn');
let stream = null;

startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    camera.srcObject = stream;
    camera.style.display = 'block';
    placeholder.style.display = 'none';
    result.textContent = 'เปิดกล้องสำเร็จ พร้อมฝึก';
  } catch (error) {
    result.textContent = 'เปิดกล้องไม่ได้ ลองใช้ Live Server หรืออนุญาตสิทธิ์กล้อง';
  }
});

stopBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  camera.style.display = 'none';
  placeholder.style.display = 'grid';
  result.textContent = 'ปิดกล้องแล้ว';
});

mockBtn.addEventListener('click', () => {
  const words = ['สวัสดี', 'ขอบคุณ', 'ขอโทษ', 'ช่วยด้วย'];
  const randomWord = words[Math.floor(Math.random() * words.length)];
  result.textContent = `จำลองตรวจพบ: ${randomWord}`;
});
