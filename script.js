const WORKER_URL = "https://YOUR-WORKER.workers.dev"; // ← вставишь сюда

let mediaRecorder;
let audioChunks = [];

const btn = document.getElementById("recordBtn");

btn.onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = processAudio;

  mediaRecorder.start();

  btn.textContent = "⏹ Stop";

  btn.onclick = () => {
    mediaRecorder.stop();
    btn.textContent = "🎤 Start Recording";
    btn.onclick = startRecording;
  };
};

async function startRecording() {}

async function processAudio() {
  const blob = new Blob(audioChunks, { type: "audio/webm" });

  const formData = new FormData();
  formData.append("audio", blob);

  // ===== STT =====
  const sttRes = await fetch(`${WORKER_URL}/stt`, {
    method: "POST",
    body: formData
  });

  const sttData = await sttRes.json();
  const text = sttData.result || "";

  document.getElementById("text").innerText = text;

  // ===== GPT =====
  const gptRes = await fetch(`${WORKER_URL}/gpt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  const data = await gptRes.json();

  document.getElementById("amount").value = data.amount || "";
  document.getElementById("wallet").value = data.wallet || "";
  document.getElementById("category").value = data.category || "";

  document.getElementById(
    "confirmation"
  ).innerText = `Вы сказали: ${data.amount}, ${data.wallet}, ${data.category}. Всё верно?`;
}

// buttons
document.getElementById("confirmBtn").onclick = () => {
  alert("Сохранено!");
};

document.getElementById("editBtn").onclick = () => {
  alert("Отредактируйте поля");
};