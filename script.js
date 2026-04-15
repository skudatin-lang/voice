const WORKER_URL = "https://yandex-gpt-proxy.skudatin.workers.dev";

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const btn = document.getElementById("recordBtn");

// ===== BUTTON =====
btn.onclick = async () => {
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Явно запрашиваем поддерживаемый формат (webm opus)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm"; // fallback

      mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        console.log("chunk:", e.data.size);
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        console.log("STOPPED, chunks:", audioChunks.length);
        await processAudio();
      };

      mediaRecorder.start();
      isRecording = true;

      btn.textContent = "🎙 Recording...";
    } catch (err) {
      alert("Нет доступа к микрофону");
      console.error(err);
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;

    btn.textContent = "⏳ Processing...";
  }
};

// ===== PROCESS AUDIO =====
async function processAudio() {
  console.log("processing audio...");

  // ✅ ИСПРАВЛЕНО: используем тип webm/opus (Yandex понимает как oggopus)
  const blob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" });

  console.log("blob size:", blob.size);

  if (blob.size === 0) {
    alert("Аудио пустое");
    btn.textContent = "🎤 Start Recording";
    return;
  }

  const formData = new FormData();
  formData.append("audio", blob);

  try {
    // ===== STT =====
    const sttRes = await fetch(`${WORKER_URL}/stt`, {
      method: "POST",
      body: formData
    });

    console.log("STT status:", sttRes.status);

    const sttData = await sttRes.json();
    console.log("STT response:", sttData); // теперь должно быть не пусто

    const text = sttData.result || "";
    document.getElementById("text").innerText = text;

    if (!text) {
      alert("Не распознано. Проверьте микрофон, говорите громче/дольше (3+ сек)");
      btn.textContent = "🎤 Start Recording";
      return;
    }

    // ===== GPT =====
    const gptRes = await fetch(`${WORKER_URL}/gpt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    const data = await gptRes.json();
    console.log("GPT:", data);

    document.getElementById("amount").value = data.amount || "";
    document.getElementById("wallet").value = data.wallet || "";
    document.getElementById("category").value = data.category || "";

    document.getElementById(
      "confirmation"
    ).innerText = `Вы сказали: ${data.amount}, ${data.wallet}, ${data.category}. Всё верно?`;

    btn.textContent = "🎤 Start Recording";

  } catch (err) {
    console.error("ERROR:", err);
    alert("Ошибка — смотри console (F12)");
    btn.textContent = "🎤 Start Recording";
  }
}

// ===== BUTTONS =====
document.getElementById("confirmBtn").onclick = () => {
  alert("Сохранено!");
};

document.getElementById("editBtn").onclick = () => {
  alert("Отредактируйте поля вручную");
};