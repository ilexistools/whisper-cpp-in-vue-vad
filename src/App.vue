<template>
  <main class="page">
    <header>
      <h1>Transcrição quase em tempo real (PT-BR)</h1>
      <p>
        Fluxo otimizado para consultas de nutricionista: captura por voz + envio em blocos com VAD.
      </p>
    </header>

    <section class="controls card">
      <label>
        URL do backend
        <input v-model="backendBase" placeholder="http://localhost:3001" />
      </label>
      <label>
        Caminho do modelo GGML
        <input v-model="modelPath" placeholder="/models/ggml-large-v3.bin" />
      </label>
      <label>
        Caminho do binário whisper-cli
        <input v-model="whisperCliPath" placeholder="/opt/whisper.cpp/build/bin/whisper-cli" />
      </label>
      <div class="buttons">
        <button :disabled="recording || loading" @click="startRecording">Iniciar</button>
        <button :disabled="!recording" class="secondary" @click="stopRecording">Parar</button>
      </div>
      <p class="status" :class="{ error: !!errorMessage }">{{ statusMessage }}</p>
    </section>

    <section class="card">
      <h2>Transcrição</h2>
      <p class="hint">Trechos são enviados automaticamente quando há fala detectada.</p>
      <div class="transcript">
        <p v-for="item in transcript" :key="item.id">
          <strong>{{ item.timestamp }}</strong> {{ item.text }}
        </p>
        <p v-if="!transcript.length" class="placeholder">Aguardando áudio...</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const backendBase = ref('http://localhost:3001');
const modelPath = ref('');
const whisperCliPath = ref('');
const transcript = ref([]);
const errorMessage = ref('');
const loading = ref(false);
const recording = ref(false);

let mediaRecorder;
let stream;
let audioContext;
let analyser;
let meterRaf;
let speaking = false;
let silenceSince = 0;
let currentChunk = [];
const audioChunksQueue = [];

const statusMessage = computed(() => {
  if (errorMessage.value) return errorMessage.value;
  if (recording.value) return 'Gravando e detectando fala...';
  if (loading.value) return 'Enviando para transcrição...';
  return 'Pronto para iniciar.';
});

function nowTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

async function startRecording() {
  errorMessage.value = '';
  transcript.value = [];

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        currentChunk.push(event.data);
      }
    };

    mediaRecorder.start(450);
    recording.value = true;
    monitorVad();
  } catch (err) {
    errorMessage.value = `Erro ao iniciar microfone: ${err?.message || err}`;
  }
}

function stopRecording() {
  recording.value = false;

  if (meterRaf) cancelAnimationFrame(meterRaf);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  flushCurrentChunk(true);

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  if (audioContext) {
    audioContext.close();
  }
}

function monitorVad() {
  if (!recording.value) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);

  let sumSquares = 0;
  for (let i = 0; i < data.length; i += 1) {
    const n = (data[i] - 128) / 128;
    sumSquares += n * n;
  }
  const rms = Math.sqrt(sumSquares / data.length);
  const voiceThreshold = 0.028;
  const silenceMs = 900;

  if (rms > voiceThreshold) {
    speaking = true;
    silenceSince = 0;
  } else if (speaking) {
    if (!silenceSince) silenceSince = performance.now();
    if (performance.now() - silenceSince > silenceMs) {
      speaking = false;
      flushCurrentChunk();
    }
  }

  meterRaf = requestAnimationFrame(monitorVad);
}

async function flushCurrentChunk(force = false) {
  if (!currentChunk.length) return;

  if (!force && speaking) return;

  const blob = new Blob(currentChunk, { type: 'audio/webm;codecs=opus' });
  currentChunk = [];
  audioChunksQueue.push(blob);
  await processQueue();
}

let queueBusy = false;
async function processQueue() {
  if (queueBusy || !audioChunksQueue.length) return;
  queueBusy = true;

  while (audioChunksQueue.length) {
    const chunk = audioChunksQueue.shift();
    const formData = new FormData();
    formData.append('audio', chunk, `chunk-${Date.now()}.webm`);
    formData.append('language', 'pt');
    formData.append('modelPath', modelPath.value);
    formData.append('whisperCliPath', whisperCliPath.value);
    loading.value = true;

    try {
      const response = await fetch(`${backendBase.value}/api/transcribe-chunk`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao transcrever');
      }

      const data = await response.json();
      if (data.text?.trim()) {
        transcript.value.push({
          id: `${Date.now()}-${Math.random()}`,
          timestamp: nowTime(),
          text: data.text.trim()
        });
      }
    } catch (err) {
      errorMessage.value = `Erro na transcrição: ${err?.message || err}`;
      break;
    } finally {
      loading.value = false;
    }
  }

  queueBusy = false;
}

onBeforeUnmount(() => {
  if (recording.value) stopRecording();
});
</script>
