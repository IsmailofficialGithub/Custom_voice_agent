// Phase 1 Test Script — dummy data validation
// Tests: health, agent CRUD, conversation create, text-only message, WebSocket

const BASE = 'http://localhost:3000/api/v1';
const API_KEY = 'dev-secret-key-change-me';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
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
  console.log('\n=== PHASE 1 TESTS ===\n');

  // 1. Health check
  console.log('1. Health check');
  const health = await req('GET', '/health', null);
  health.status === 200 && health.data?.status === 'ok'
    ? pass(`GET /health → ${JSON.stringify(health.data)}`)
    : fail('Health check failed', health);

  // 2. Unauthenticated request should 401
  console.log('\n2. Auth guard');
  const unauth = await fetch(`${BASE}/agents`, { method: 'GET' });
  unauth.status === 401
    ? pass('Unauthenticated request → 401 Unauthorized')
    : fail('Auth guard not working', { status: unauth.status });

  // 3. Create agent
  console.log('\n3. Create agent');
  const { status: s1, data: agent } = await req('POST', '/agents', {
    name: 'Finance Advisor',
    systemPrompt: 'You are a careful, precise personal finance advisor. Help the user make smart financial decisions.',
    enabledTools: ['get_time', 'web_search'],
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
  });
  s1 === 201 && agent?.id
    ? pass(`Created agent: ${agent.id} (${agent.name})`)
    : fail('Create agent failed', { s1, agent });

  const agentId = agent?.id;

  // 4. List agents
  console.log('\n4. List agents');
  const { status: s2, data: agents } = await req('GET', '/agents', null);
  s2 === 200 && Array.isArray(agents) && agents.length >= 1
    ? pass(`Listed ${agents.length} agent(s)`)
    : fail('List agents failed', { s2, agents });

  // 5. Get agent
  console.log('\n5. Get single agent');
  const { status: s3, data: fetchedAgent } = await req('GET', `/agents/${agentId}`, null);
  s3 === 200 && fetchedAgent?.id === agentId
    ? pass(`Fetched agent: ${fetchedAgent.name}`)
    : fail('Get agent failed', { s3, fetchedAgent });

  // 6. Update agent
  console.log('\n6. Update agent');
  const { status: s4, data: updated } = await req('PATCH', `/agents/${agentId}`, {
    name: 'Finance Advisor Pro',
  });
  s4 === 200 && updated?.name === 'Finance Advisor Pro'
    ? pass(`Updated agent name to: ${updated.name}`)
    : fail('Update agent failed', { s4, updated });

  // 7. Create conversation
  console.log('\n7. Create conversation');
  const { status: s5, data: conv } = await req('POST', `/agents/${agentId}/conversations`, {
    title: 'Test Session',
  });
  s5 === 201 && conv?.id
    ? pass(`Created conversation: ${conv.id}`)
    : fail('Create conversation failed', { s5, conv });

  const convId = conv?.id;

  // 8. Get messages (should be empty)
  console.log('\n8. Get messages (empty)');
  const { status: s6, data: msgs } = await req('GET', `/conversations/${convId}/messages`, null);
  s6 === 200 && Array.isArray(msgs) && msgs.length === 0
    ? pass('Empty message list returned correctly')
    : fail('Get messages failed', { s6, msgs });

  // 9. Text-only message (get_time tool)
  console.log('\n9. Text message — get_time tool (no LLM API key needed for tool itself)');
  console.log('   ⚠️  This will attempt LLM call — expected to fail without real API key, checking error handling...');
  const { status: s7, data: msg } = await req('POST', `/conversations/${convId}/messages`, {
    content: 'What time is it in Karachi?',
  });
  // Accept either a valid response OR a handled error (not 500 crash)
  s7 < 500
    ? pass(`Text message responded with status ${s7} (no crash)`)
    : fail('Text message caused server crash', { s7, msg });

  // 10. 404 on missing agent
  console.log('\n10. 404 on missing resource');
  const { status: s8 } = await req('GET', '/agents/00000000-0000-0000-0000-000000000000', null);
  s8 === 404
    ? pass('Non-existent agent → 404 Not Found')
    : fail('Expected 404', { s8 });

  // 11. Delete agent
  console.log('\n11. Delete agent (cascade)');
  const { status: s9 } = await req('DELETE', `/agents/${agentId}`, null);
  s9 === 200
    ? pass(`Deleted agent ${agentId} (and cascaded conversations/docs)`)
    : fail('Delete agent failed', { s9 });

  // 12. Confirm deleted
  const { status: s10 } = await req('GET', `/agents/${agentId}`, null);
  s10 === 404
    ? pass('Deleted agent returns 404 ✓')
    : fail('Deleted agent still accessible', { s10 });

  console.log('\n=== TESTS COMPLETE ===\n');
}

run().catch((err) => {
  console.error('Test script error:', err);
  process.exitCode = 1;
});
