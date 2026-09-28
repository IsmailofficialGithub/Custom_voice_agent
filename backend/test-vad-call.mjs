// End-to-End VAD Voice Call Test Script
import WebSocket from 'ws';

const WS_BASE = 'ws://localhost:3002/api/v1/voice';
const BASE_HTTP = 'http://localhost:3002/api/v1';
const API_KEY = 'dev-secret-key-change-me';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function run() {
  console.log('=== VAD VOICE CALL INTEGRATION TEST ===\n');

  // 1. Create agent & conversation
  const agentRes = await fetch(`${BASE_HTTP}/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'VAD Test Bot',
      systemPrompt: 'You are a helpful voice assistant.',
      enabledTools: [],
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
    }),
  });
  const agent = await agentRes.json();
  console.log(`✅ Agent Created: ${agent.id}`);

  const convRes = await fetch(`${BASE_HTTP}/agents/${agent.id}/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'VAD Voice Test' }),
  });
  const conv = await convRes.json();
  console.log(`✅ Conversation Created: ${conv.id}`);

  // 2. Connect WebSocket
  const ws = new WebSocket(`${WS_BASE}?conversationId=${conv.id}&apiKey=${API_KEY}`);

  await new Promise((resolve) => {
    ws.on('open', () => {
      console.log('✅ WebSocket Connected');
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        console.log(`✅ Server confirmed connection: conversationId=${msg.conversationId}`);
        resolve();
      }
    });
  });

  // 3. Test Text-to-Speech Turn (Simulating turn completion)
  console.log('\n--- Sending Text Turn via WebSocket ---');
  ws.send(JSON.stringify({
    event: 'message',
    data: {
      type: 'text_message',
      text: 'Hello, testing real-time voice call integration.',
    }
  }));

  let receivedTTS = false;
  let receivedText = false;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Turn timeout')), 15000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log(`  📩 Event: ${msg.type}`, msg.text ? `"${msg.text.substring(0, 40)}..."` : msg.status || '');

      if (msg.type === 'response_text_chunk') {
        receivedText = true;
      }
      if (msg.type === 'audio_response_chunk') {
        receivedTTS = true;
        console.log(`  🎵 Received base64 TTS audio: ${Math.round(msg.data.length / 1024)} KB`);
      }
      if (msg.type === 'end_of_response') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  ws.close();

  // Cleanup
  await fetch(`${BASE_HTTP}/agents/${agent.id}`, { method: 'DELETE', headers });
  console.log(`\n✅ Cleaned up agent ${agent.id}`);

  if (receivedText && receivedTTS) {
    console.log('\n🎉 ALL VAD VOICE CALL WS TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\n❌ Test failed: missing text or audio response');
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exitCode = 1;
});
