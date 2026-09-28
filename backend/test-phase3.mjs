// Phase 3 Test Script — Memory System Validation
// Tests: Short-term rolling window, session end summarization to pgvector, cross-session long-term memory recall

const BASE = 'http://localhost:3000/api/v1';
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
  console.log('\n=== PHASE 3 TESTS (Memory & Cross-Session Recall) ===\n');

  // 1. Health check
  console.log('1. Health check');
  const health = await req('GET', '/health', null);
  health.status === 200 && health.data?.status === 'ok'
    ? pass(`GET /health → ${JSON.stringify(health.data)}`)
    : fail('Health check failed', health);

  // 2. Create agent
  console.log('\n2. Create Memory Agent');
  const { status: s1, data: agent } = await req('POST', '/agents', {
    name: 'Memory Assistant',
    systemPrompt: 'You are an attentive AI assistant that remembers user preferences across sessions.',
    enabledTools: ['get_time'],
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
  });
  s1 === 201 && agent?.id
    ? pass(`Created agent: ${agent.id} (${agent.name})`)
    : fail('Create agent failed', { s1, agent });

  const agentId = agent?.id;

  // 3. Session 1: Create conversation
  console.log('\n3. Session 1 — Store facts');
  const { status: s2, data: conv1 } = await req('POST', `/agents/${agentId}/conversations`, {
    title: 'Initial Intro Session',
  });
  s2 === 201 && conv1?.id
    ? pass(`Created Session 1 conversation: ${conv1.id}`)
    : fail('Create conversation 1 failed', { s2, conv1 });

  const conv1Id = conv1?.id;

  // 4. Session 1: Send user preference message
  console.log('   Sending preference statement to Session 1...');
  const { status: s3, data: msg1 } = await req('POST', `/conversations/${conv1Id}/messages`, {
    content: 'Hi! Please remember that my favorite programming language is Rust and I currently live in Islamabad.',
  });
  s3 === 200 && msg1?.content
    ? pass(`Session 1 response: "${msg1.content.substring(0, 80)}..."`)
    : fail('Session 1 message failed', { s3, msg1 });

  // 5. End Session 1 — Triggers memory summarization
  console.log('\n4. Ending Session 1 (triggers long-term memory extraction & embedding)');
  const { status: s4 } = await req('POST', `/conversations/${conv1Id}/end`, null);
  s4 === 200
    ? pass(`Session 1 ended cleanly`)
    : fail('End conversation 1 failed', { s4 });

  // 6. Pause briefly for async LLM summarization + pgvector embedding insert
  console.log('   Waiting 5 seconds for background memory summarization & vector embedding...');
  await new Promise((r) => setTimeout(r, 5000));

  // 7. Session 2: Create new separate conversation
  console.log('\n5. Session 2 — Test cross-session recall');
  const { status: s5, data: conv2 } = await req('POST', `/agents/${agentId}/conversations`, {
    title: 'New Session Next Day',
  });
  s5 === 201 && conv2?.id
    ? pass(`Created Session 2 conversation: ${conv2.id}`)
    : fail('Create conversation 2 failed', { s5, conv2 });

  const conv2Id = conv2?.id;

  // 8. Session 2: Ask unprompted question about facts from Session 1
  console.log('   Asking Session 2 question requiring cross-session recall...');
  const { status: s6, data: msg2 } = await req('POST', `/conversations/${conv2Id}/messages`, {
    content: 'Can you remind me what my favorite programming language is and what city I live in?',
  });

  s6 === 200 && msg2?.content
    ? pass(`Session 2 recall response:\n     "${msg2.content.replace(/\n/g, ' ')}"`)
    : fail('Session 2 recall query failed', { s6, msg2 });

  // Verify memory recall grounding
  const respLower = (msg2?.content ?? '').toLowerCase();
  const recalledRust = respLower.includes('rust');
  const recalledIslamabad = respLower.includes('islamabad');

  if (recalledRust && recalledIslamabad) {
    pass('Cross-session memory recall SUCCESS — Assistant correctly recalled Rust and Islamabad!');
  } else {
    fail('Memory recall check failed — missing recalled facts', { content: msg2?.content });
  }

  // 9. Clean up Memory Agent
  console.log('\n6. Clean up Memory Agent');
  const { status: s7 } = await req('DELETE', `/agents/${agentId}`, null);
  s7 === 200
    ? pass(`Deleted agent ${agentId} (cascaded memories & conversations)`)
    : fail('Delete agent failed', { s7 });

  console.log('\n=== PHASE 3 TESTS COMPLETE ===\n');
}

run().catch((err) => {
  console.error('Phase 3 test script error:', err);
  process.exitCode = 1;
});
