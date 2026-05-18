// ใส่ข้อมูลบทเรียนตรงนี้
// วิธีใส่วิดีโอของตัวเอง: เอาไฟล์ mp4 ไปไว้ในโฟลเดอร์ videos/ แล้วแก้ path ในช่อง video
// เช่น video: "videos/hello.mp4"

const lessons = [
  {
    id: 1,
    category: "การทักทาย",
    title: "สวัสดี",
    description: "ใช้สำหรับทักทายเมื่อพบกัน",
    level: "เริ่มต้น",
    video: "videos/sample-hello.mp4"
  },
  {
    id: 2,
    category: "การทักทาย",
    title: "ขอบคุณ",
    description: "ใช้แสดงความขอบคุณ",
    level: "เริ่มต้น",
    video: "videos/sample-thankyou.mp4"
  },
  {
    id: 3,
    category: "ชีวิตประจำวัน",
    title: "กินข้าว",
    description: "ใช้สื่อสารเกี่ยวกับการรับประทานอาหาร",
    level: "เริ่มต้น",
    video: "videos/sample-eat.mp4"
  },
  {
    id: 4,
    category: "ชีวิตประจำวัน",
    title: "ไปไหน",
    description: "ใช้ถามสถานที่หรือจุดหมาย",
    level: "เริ่มต้น",
    video: "videos/sample-where.mp4"
  },
  {
    id: 5,
    category: "ฉุกเฉิน",
    title: "ช่วยด้วย",
    description: "ใช้ขอความช่วยเหลือในสถานการณ์จำเป็น",
    level: "สำคัญ",
    video: "videos/sample-help.mp4"
  },
  {
    id: 6,
    category: "มารยาท",
    title: "ขอโทษ",
    description: "ใช้เมื่อต้องการขอโทษ",
    level: "เริ่มต้น",
    video: "videos/sample-sorry.mp4"
  }
];
