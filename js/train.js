const datasetFile = document.getElementById("datasetFile");
const trainBtn = document.getElementById("trainBtn");
const trainStatus = document.getElementById("trainStatus");
const trainProgress = document.getElementById("trainProgress");
const labelOutput = document.getElementById("labelOutput");
const datasetCount = document.getElementById("datasetCount");
const labelCount = document.getElementById("labelCount");

const INPUT_SIZE = 126;
let dataset = [];

datasetFile.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    const text = await file.text();
    dataset = JSON.parse(text);

    const labels = [...new Set(dataset.map(item => item.label))];

    datasetCount.textContent = dataset.length;
    labelCount.textContent = labels.length;
    labelOutput.textContent = JSON.stringify(labels, null, 2);

    trainStatus.textContent = `โหลดข้อมูลแล้ว ${dataset.length} ตัวอย่าง`;
  } catch (error) {
    console.error(error);
    alert("อ่านไฟล์ dataset ไม่ได้");
  }
});

trainBtn.addEventListener("click", trainModel);

async function trainModel() {
  if (!dataset || dataset.length < 50) {
    alert("ข้อมูลน้อยเกินไป แนะนำให้เก็บอย่างน้อย 50 ตัวอย่างขึ้นไป");
    return;
  }

  const invalidItem = dataset.find(item => {
    return !item.vector || item.vector.length !== INPUT_SIZE;
  });

  if (invalidItem) {
    alert("dataset มีข้อมูลที่ไม่ใช่ 126 ค่า กรุณาเก็บข้อมูลใหม่ให้เป็น 126 ค่าทั้งหมด");
    return;
  }

  const labels = [...new Set(dataset.map(item => item.label))];

  if (labels.length < 2) {
    alert("ต้องมีอย่างน้อย 2 คำขึ้นไปถึงจะเทรนได้");
    return;
  }

  const labelToIndex = {};

  labels.forEach((label, index) => {
    labelToIndex[label] = index;
  });

  const shuffledDataset = shuffle(dataset);

  const xsData = shuffledDataset.map(item => item.vector);
  const ysData = shuffledDataset.map(item => labelToIndex[item.label]);

  const xs = tf.tensor2d(xsData, [xsData.length, INPUT_SIZE]);
  const labelTensor = tf.tensor1d(ysData, "int32");
  const ys = tf.oneHot(labelTensor, labels.length);

  const model = tf.sequential();

  model.add(tf.layers.dense({
    inputShape: [INPUT_SIZE],
    units: 128,
    activation: "relu"
  }));

  model.add(tf.layers.dropout({
    rate: 0.25
  }));

  model.add(tf.layers.dense({
    units: 64,
    activation: "relu"
  }));

  model.add(tf.layers.dropout({
    rate: 0.15
  }));

  model.add(tf.layers.dense({
    units: labels.length,
    activation: "softmax"
  }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"]
  });

  trainStatus.textContent = "กำลังเทรนโมเดล...";
  trainProgress.style.width = "0%";

  await model.fit(xs, ys, {
    epochs: 100,
    batchSize: 16,
    validationSplit: 0.2,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const percent = Math.round(((epoch + 1) / 100) * 100);
        trainProgress.style.width = `${percent}%`;

        const acc = logs.acc || logs.accuracy || 0;
        const valAcc = logs.val_acc || logs.val_accuracy || 0;
        const loss = logs.loss || 0;

        trainStatus.textContent =
          `Epoch ${epoch + 1}/100 | accuracy ${(acc * 100).toFixed(1)}% | val ${(valAcc * 100).toFixed(1)}% | loss ${loss.toFixed(4)}`;
      }
    }
  });

  trainStatus.textContent = "เทรนเสร็จแล้ว กำลังดาวน์โหลดโมเดล...";

  await model.save("downloads://ksl-sign-model");

  downloadLabels(labels);

  labelOutput.textContent = JSON.stringify(labels, null, 2);

  xs.dispose();
  ys.dispose();
  labelTensor.dispose();

  trainStatus.textContent =
    "เสร็จแล้ว ให้นำ model.json, .bin และ labels.json ไปไว้ใน models/ksl-sign-model/";
}

function downloadLabels(labels) {
  const blob = new Blob([JSON.stringify(labels, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "labels.json";
  a.click();

  URL.revokeObjectURL(url);
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}