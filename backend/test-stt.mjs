import OpenAI, { toFile } from 'openai';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const apiKey = process.env.OPENAI_API_KEY;
const client = new OpenAI({ apiKey });

// Helper to create a valid 1-second 16kHz MONO PCM WAV file buffer
function createWavBuffer(sampleRate = 16000, durationSec = 1) {
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write a gentle 440Hz sine wave tone
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 10000;
    buffer.writeInt16LE(Math.floor(sample), 44 + i * 2);
  }

  return buffer;
}

async function testValidWav() {
  try {
    const wavBuffer = createWavBuffer(16000, 1.5);
    console.log(`Generated valid WAV buffer (${wavBuffer.length} bytes)...`);

    const file = await toFile(wavBuffer, 'speech.wav', { type: 'audio/wav' });
    console.log('File:', file);

    const response = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });
    console.log('🎉 SUCCESS! Transcription result:', response);
  } catch (err) {
    console.error('WAV STT Error:', err.message || err);
  }
}

testValidWav();
