// Phase 2 Test Script — Document Upload & RAG Validation
// Tests: PDF upload, async ingestion to pgvector, search_knowledge_base tool, grounded LLM response, document CRUD

import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000/api/v1';
const API_KEY = 'dev-secret-key-change-me';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
};

async function jsonReq(method, pathUrl, body) {
  const res = await fetch(`${BASE}${pathUrl}`, {
    method,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.error(`  ❌ ${label}`, detail); process.exitCode = 1; }

async function run() {
  console.log('\n=== PHASE 2 TESTS (RAG & Document Ingestion) ===\n');

  // 1. Health check
  console.log('1. Health check');
  const health = await jsonReq('GET', '/health', null);
  health.status === 200 && health.data?.status === 'ok'
    ? pass(`GET /health → ${JSON.stringify(health.data)}`)
    : fail('Health check failed', health);

  // 2. Create agent with search_knowledge_base tool
  console.log('\n2. Create RAG Agent');
  const { status: s1, data: agent } = await jsonReq('POST', '/agents', {
    name: 'Axiomra Knowledge Bot',
    systemPrompt: 'You are an internal assistant for Axiomra employees. Use the knowledge base to answer company policy questions.',
    enabledTools: ['search_knowledge_base', 'get_time'],
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
  });
  s1 === 201 && agent?.id
    ? pass(`Created agent: ${agent.id} (${agent.name})`)
    : fail('Create agent failed', { s1, agent });

  const agentId = agent?.id;

  // 3. Create dummy PDF file for upload
  console.log('\n3. Create sample PDF & upload to agent');
  const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 220>>stream
BT /F1 12 Tf 50 700 Td (AXIROM COMPANY POLICY DOCUMENT 2026) Tj ET
BT /F1 10 Tf 50 670 Td (Section 4.2 - Remote Work Stipend:) Tj ET
BT /F1 10 Tf 50 650 Td (All full-time Axiomra engineers are entitled to a monthly equipment stipend of 750 USD.) Tj ET
BT /F1 10 Tf 50 630 Td (Requests must be submitted via the internal Portal code AXI-750.) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000318 00000 n 
trailer
<</Size 6/Root 1 0 R>>
startxref
590
%%EOF`;

  const tempPdfPath = path.join(process.cwd(), 'temp_axiomra_policy.pdf');
  fs.writeFileSync(tempPdfPath, pdfContent);

  // Upload PDF via FormData
  const fileBuffer = fs.readFileSync(tempPdfPath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, 'axiomra_policy_2026.pdf');

  const uploadRes = await fetch(`${BASE}/agents/${agentId}/documents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: formData,
  });
  const uploadData = await uploadRes.json().catch(() => null);

  uploadRes.status === 202 && uploadData?.id
    ? pass(`Uploaded document: ${uploadData.id} (Status: ${uploadData.status})`)
    : fail('Document upload failed', { status: uploadRes.status, uploadData });

  const docId = uploadData?.id;

  // Clean up temp file
  if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

  // 4. Poll until document ingestion completes (status === 'ready')
  console.log('\n4. Waiting for background PDF embedding ingestion...');
  let isReady = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: docs } = await jsonReq('GET', `/agents/${agentId}/documents`, null);
    const target = docs?.find((d) => d.id === docId);
    if (target?.status === 'ready') {
      isReady = true;
      pass(`Document ${docId} processed into pgvector embeddings! (status: ready)`);
      break;
    }
  }
  if (!isReady) fail('Document ingestion timed out or failed', { docId });

  // 5. Create conversation
  console.log('\n5. Create conversation for RAG testing');
  const { status: s2, data: conv } = await jsonReq('POST', `/agents/${agentId}/conversations`, {
    title: 'Policy Inquiry',
  });
  s2 === 201 && conv?.id
    ? pass(`Created conversation: ${conv.id}`)
    : fail('Create conversation failed', { s2, conv });

  const convId = conv?.id;

  // 6. Send RAG query — require knowledge base lookup
  console.log('\n6. Send text message triggering RAG search');
  const { status: s3, data: msg } = await jsonReq('POST', `/conversations/${convId}/messages`, {
    content: 'What is the monthly remote work equipment stipend amount for full-time engineers at Axiomra according to section 4.2?',
  });

  s3 === 200 && msg?.content
    ? pass(`RAG response received (status 200):\n     "${msg.content.replace(/\n/g, ' ')}"`)
    : fail('RAG search failed', { s3, msg });

  // Verify answer grounding
  const responseLower = (msg?.content ?? '').toLowerCase();
  if (responseLower.includes('750') || responseLower.includes('axi-750')) {
    pass('Grounding check passed — response contains exact stipend details (750 USD / AXI-750)');
  } else {
    fail('Grounding check failed — response missing extracted facts', { response: msg?.content });
  }

  // 7. Delete document
  console.log('\n7. Delete document');
  const { status: s4 } = await jsonReq('DELETE', `/documents/${docId}`, null);
  s4 === 200
    ? pass(`Deleted document ${docId}`)
    : fail('Delete document failed', { s4 });

  // 8. Cascade delete agent
  console.log('\n8. Clean up RAG Agent');
  const { status: s5 } = await jsonReq('DELETE', `/agents/${agentId}`, null);
  s5 === 200
    ? pass(`Deleted agent ${agentId}`)
    : fail('Delete agent failed', { s5 });

  console.log('\n=== PHASE 2 TESTS COMPLETE ===\n');
}

run().catch((err) => {
  console.error('Phase 2 test script error:', err);
  process.exitCode = 1;
});
