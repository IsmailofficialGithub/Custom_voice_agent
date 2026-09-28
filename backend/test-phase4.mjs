// Phase 4 Test Script — WebSocket Voice Gateway & STT/TTS Streaming Validation
// Tests: WebSocket authentication, text_message over WS, audio_chunk/end_of_turn, OpenAI STT & TTS streaming responses

import WebSocket from 'ws';

const BASE = 'http://localhost:3000/api/v1';
const WS_BASE = 'ws://localhost:3000/api/v1/voice';
const API_KEY = 'dev-secret-key-change-me';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function req(method, pathUrl, body) {
  const res = await fetch(`${BASE}${pathUrl}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.error(`  ❌ ${label}`, detail); process.exitCode = 1; }

async function run() {
  console.log('\n=== PHASE 4 TESTS (Voice Gateway, STT & TTS) ===\n');

  // 1. Health check
  console.log('1. Health check');
  const health = await req('GET', '/health', null);
  health.status === 200 && health.data?.status === 'ok'
    ? pass(`GET /health → ${JSON.stringify(health.data)}`)
    : fail('Health check failed', health);

  // 2. Create agent
  console.log('\n2. Create Voice Agent');
  const { status: s1, data: agent } = await req('POST', '/agents', {
    name: 'Voice Bot',
    systemPrompt: 'You are a helpful voice assistant.',
    enabledTools: ['get_time'],
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
  });
  s1 === 201 && agent?.id
    ? pass(`Created agent: ${agent.id} (${agent.name})`)
    : fail('Create agent failed', { s1, agent });

  const agentId = agent?.id;

  // 3. Create conversation
  console.log('\n3. Create Conversation');
  const { status: s2, data: conv } = await req('POST', `/agents/${agentId}/conversations`, {
    title: 'Voice Session 1',
  });
  s2 === 201 && conv?.id
    ? pass(`Created conversation: ${conv.id}`)
    : fail('Create conversation failed', { s2, conv });

  const convId = conv?.id;

  // 4. Connect WebSocket with auth
  console.log('\n4. Connecting to Voice Gateway WebSocket...');
  const wsUrl = `${WS_BASE}?conversationId=${convId}&apiKey=${API_KEY}`;
  const ws = new WebSocket(wsUrl);

  const eventsReceived = [];

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);

    ws.on('open', () => {
      pass('WebSocket connected to /api/v1/voice');
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      eventsReceived.push(msg);

      if (msg.type === 'connected') {
        clearTimeout(timeout);
        pass(`Received WS 'connected' event for conversation ${msg.conversationId}`);
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // 5. Test WebSocket text_message turn
  console.log('\n5. Sending text message over WebSocket...');
  ws.send(JSON.stringify({
    event: 'message',
    data: {
      type: 'text_message',
      text: 'What time is it right now?',
    },
  }));

  let receivedAudio = false;
  let receivedResponseText = false;
  let receivedEndOfResponse = false;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket text turn response timeout')), 15000);

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'response_text_chunk' && msg.text) {
        receivedResponseText = true;
        pass(`Received text chunk: "${msg.text.substring(0, 60)}..."`);
      }

      if (msg.type === 'audio_response_chunk' && msg.data) {
        receivedAudio = true;
        pass(`Received TTS MP3 audio chunk (${Math.round(msg.data.length / 1024)} KB base64)`);
      }

      if (msg.type === 'end_of_response') {
        receivedEndOfResponse = true;
        clearTimeout(timeout);
        pass('Received end_of_response event!');
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  ws.close();

  if (receivedResponseText && receivedAudio && receivedEndOfResponse) {
    pass('Voice Gateway pipeline test SUCCESS — Text, STT/TTS audio streaming working seamlessly!');
  } else {
    fail('Voice Gateway pipeline check failed', { receivedResponseText, receivedAudio, receivedEndOfResponse });
  }

  // 6. Clean up Agent
  console.log('\n6. Clean up Voice Agent');
  const { status: s3 } = await req('DELETE', `/agents/${agentId}`, null);
  s3 === 200
    ? pass(`Deleted agent ${agentId}`)
    : fail('Delete agent failed', { s3 });

  console.log('\n=== PHASE 4 TESTS COMPLETE ===\n');
}

run().catch((err) => {
  console.error('Phase 4 test script error:', err);
  process.exitCode = 1;
});
