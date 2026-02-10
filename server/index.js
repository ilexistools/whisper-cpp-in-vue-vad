import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import multer from 'multer';

const execFileAsync = promisify(execFile);
const app = express();
const upload = multer({ dest: path.join(os.tmpdir(), 'whisper-chunks') });
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'whisper-cpp-vad-bridge' });
});

app.post('/api/transcribe-chunk', upload.single('audio'), async (req, res) => {
  const inputFile = req.file?.path;

  if (!inputFile) {
    return res.status(400).send('Arquivo de áudio não enviado.');
  }

  const modelPath = req.body.modelPath || process.env.WHISPER_MODEL_PATH;
  const whisperCliPath = req.body.whisperCliPath || process.env.WHISPER_CLI_PATH || 'whisper-cli';
  const language = req.body.language || 'pt';

  if (!modelPath) {
    await fs.rm(inputFile, { force: true });
    return res.status(400).send('Defina modelPath no formulário ou WHISPER_MODEL_PATH no servidor.');
  }

  const runId = randomUUID();
  const wavFile = path.join(os.tmpdir(), `chunk-${runId}.wav`);
  const txtPrefix = path.join(os.tmpdir(), `chunk-${runId}`);

  try {
    await execFileAsync('ffmpeg', ['-y', '-i', inputFile, '-ac', '1', '-ar', '16000', wavFile], {
      maxBuffer: 1024 * 1024 * 8
    });

    const whisperArgs = [
      '-m', modelPath,
      '-f', wavFile,
      '-l', language,
      '-nt',
      '-otxt',
      '-of', txtPrefix
    ];

    await execFileAsync(whisperCliPath, whisperArgs, {
      maxBuffer: 1024 * 1024 * 8
    });

    const text = await fs.readFile(`${txtPrefix}.txt`, 'utf8');

    res.json({ text });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr) : '';
    const stdout = error?.stdout ? String(error.stdout) : '';
    res.status(500).send(`Erro executando whisper.cpp.\n${stderr || stdout || error.message}`);
  } finally {
    await Promise.all([
      fs.rm(inputFile, { force: true }),
      fs.rm(wavFile, { force: true }),
      fs.rm(`${txtPrefix}.txt`, { force: true }),
      fs.rm(`${txtPrefix}.json`, { force: true }),
      fs.rm(`${txtPrefix}.srt`, { force: true }),
      fs.rm(`${txtPrefix}.vtt`, { force: true })
    ]);
  }
});

app.listen(PORT, () => {
  console.log(`API pronta em http://localhost:${PORT}`);
});
