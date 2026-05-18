# SignBridge Prototype

เว็บต้นแบบสำหรับการเรียนรู้ภาษามือไทย เหมาะสำหรับนำไปต่อยอดโครงงาน NSC 2026

## วิธีเปิดเว็บ

1. แตกไฟล์ zip
2. เปิดโฟลเดอร์ด้วย VS Code
3. ติดตั้ง Extension ชื่อ Live Server
4. คลิกขวาที่ `index.html` แล้วเลือก `Open with Live Server`

> หน้า `practice.html` ที่ใช้กล้องควรเปิดผ่าน Live Server เพื่อให้เบราว์เซอร์อนุญาตใช้กล้องได้ง่ายขึ้น

## โครงสร้างไฟล์

```txt
sign-language-web-ai/
├── index.html
├── learn.html
├── quiz.html
├── practice.html
├── login.html
├── register.html
├── dashboard.html
├── css/style.css
├── js/data.js
├── js/learn.js
├── js/quiz.js
├── js/camera.js
├── js/auth.js
├── videos/
├── images/
└── docs/AI_TRAINING_GUIDE.md
```

## วิธีเพิ่มบทเรียน

เปิดไฟล์ `js/data.js` แล้วเพิ่มข้อมูลแบบนี้

```js
{
  id: 7,
  category: "การทักทาย",
  title: "ยินดีที่ได้รู้จัก",
  description: "ใช้เมื่อพบกันครั้งแรก",
  level: "เริ่มต้น",
  video: "videos/nice-to-meet-you.mp4"
}
```

จากนั้นเอาไฟล์วิดีโอไปวางที่โฟลเดอร์ `videos/`

## สิ่งที่เป็น Prototype

- Login/Register เก็บข้อมูลใน `localStorage`
- คะแนน Quiz เก็บในเครื่องผู้ใช้
- Webcam เปิดกล้องได้จริง แต่ AI Detection เป็น Mock Result
- สามารถต่อยอดเป็น AI จริงด้วย MediaPipe และ Teachable Machine ได้
