# whisper-cpp-in-vue-vad (PT-BR)

Implementação funcional com Vue 3 + backend Node para usar `whisper.cpp` em transcrição quase em tempo real com VAD (detecção de voz), voltada para consultas de nutricionista em português.

## O que está pronto

- Interface web em Vue com UX parecida ao projeto de referência (controles de início/parada, transcript incremental e status).
- Captura de áudio no navegador com chunking contínuo.
- VAD simples baseado em energia RMS para enviar bloco quando a fala termina.
- API Express que recebe os blocos, converte com `ffmpeg`, e chama `whisper-cli`.
- Retorno incremental para exibição de texto quase em tempo real.

## Pré-requisitos

1. Node.js 20+
2. `ffmpeg` instalado no host
3. `whisper.cpp` compilado e com o binário `whisper-cli`
4. Modelo `.bin` (GGML/GGUF compatível com a sua build)

## Instalação

```bash
npm install
```

## Execução em desenvolvimento

```bash
npm run dev
```

- Front-end: `http://localhost:5173`
- API: `http://localhost:3001`

## Configuração

Na interface, informe:

- **Caminho do modelo GGML**: ex. `/opt/models/ggml-large-v3.bin`
- **Caminho do whisper-cli**: ex. `/opt/whisper.cpp/build/bin/whisper-cli`

Ou defina no servidor:

```bash
export WHISPER_MODEL_PATH=/opt/models/ggml-large-v3.bin
export WHISPER_CLI_PATH=/opt/whisper.cpp/build/bin/whisper-cli
npm run dev:api
```

## Endpoint

`POST /api/transcribe-chunk` com form-data:

- `audio`: arquivo webm
- `language`: padrão `pt`
- `modelPath` (opcional se env definida)
- `whisperCliPath` (opcional se env definida)

## Observações para consultas de nutricionista

- Para melhor qualidade em português, use modelo maior (ex: `large-v3`).
- Em ambiente de consultório, prefira microfone direcional próximo ao profissional.
- Ajuste os limiares no VAD (`voiceThreshold`, `silenceMs` em `src/App.vue`) para seu ambiente acústico.
