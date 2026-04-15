const WORKER_URL = "https://yandex-gpt-proxy.skudatin.workers.dev";

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let sourceNode = null;
let processorNode = null;
let stream = null;

const btn = document.getElementById("recordBtn");

// Функция для конвертации Float32 PCM в Int16 PCM и обёртки в WAV
function float32ToInt16PCM(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

function encodeWAV(samples, sampleRate) {
  const int16Samples = float32ToInt16PCM(samples);
  const buffer = new ArrayBuffer(44 + int16Samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + int16Samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, int16Samples.length * 2, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < int16Samples.length; i++, offset += 2) {
    view.setInt16(offset, int16Samples[i], true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Запись через AudioContext
async function startWavRecording() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  sourceNode = audioContext.createMediaStreamSource(stream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);

  const pcmData = [];

  processorNode.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    pcmData.push(new Float32Array(inputData));
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);

  // Запуск контекста (браузеры требуют жеста пользователя)
  await audioContext.resume();

  // Возвращаем функцию остановки, которая соберёт WAV
  return () => {
    return new Promise((resolve) => {
      processorNode.onaudioprocess = null;
      sourceNode.disconnect();
      processorNode.disconnect();
      audioContext.close().catch(console.warn);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Объединяем все Float32Array в один
      const totalLength = pcmData.reduce((sum, arr) => sum + arr.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const arr of pcmData) {
        combined.set(arr, offset);
        offset += arr.length;
      }
      const wavBlob = encodeWAV(combined, sampleRate);
      resolve(wavBlob);
    });
  };
}

// ===== BUTTON =====
btn.onclick = async () => {
  if (!isRecording) {
    try {
      const stopRecording = await startWavRecording();
      isRecording = true;
      btn.textContent = "🎙 Recording...";

      // Сохраняем функцию остановки
      window.stopRecordingFunc = stopRecording;
    } catch (err) {
      alert("Нет доступа к микрофону");
      console.error(err);
    }
  } else {
    btn.textContent = "⏳ Processing...";
    const stopFunc = window.stopRecordingFunc;
    if (stopFunc) {
      const wavBlob = await stopFunc();
      await processAudio(wavBlob);
    }
    isRecording = false;
    btn.textContent = "🎤 Start Recording";
    window.stopRecordingFunc = null;
  }
};

// ===== PROCESS AUDIO =====
async function processAudio(wavBlob) {
  console.log("WAV blob size:", wavBlob.size);

  if (wavBlob.size === 0) {
    alert("Аудио пустое");
    return;
  }

  const formData = new FormData();
  formData.append("audio", wavBlob);

  try {
    // ===== STT =====
    const sttRes = await fetch(`${WORKER_URL}/stt`, {
      method: "POST",
      body: formData
    });

    console.log("STT status:", sttRes.status);

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      console.error("STT error response:", errText);
      alert(`STT ошибка: ${sttRes.status} ${errText}`);
      return;
    }

    const sttData = await sttRes.json();
    console.log("STT response:", sttData);

    const text = sttData.result || "";
    document.getElementById("text").innerText = text;

    if (!text) {
      alert("Не распознано. Говорите громче и чётче, минимум 2-3 секунды.");
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

  } catch (err) {
    console.error("ERROR:", err);
    alert("Ошибка — смотри console (F12)");
  }
}

// ===== BUTTONS =====
document.getElementById("confirmBtn").onclick = () => {
  alert("Сохранено!");
};

document.getElementById("editBtn").onclick = () => {
  alert("Отредактируйте поля вручную");
};