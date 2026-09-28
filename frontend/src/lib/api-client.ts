// Type-Safe API Client for NestJS Backend (http://localhost:3000/api/v1)

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
  enabledTools: string[];
  llmProvider: string;
  llmModel: string;
  ttsVoice?: string;
  ttsGender?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  agentId: string;
  title: string | null;
  contextPrompt?: string | null;
  ttsVoice?: string | null;
  ttsGender?: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount?: number;
  lastMessage?: {
    role: string;
    content: string;
    createdAt: string;
  } | null;
}


export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  agentId: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed';
  uploadedAt: string;
}

export interface HealthCheck {
  status: string;
  database: string;
  timestamp: string;
}

async function fetchWithAuth<T>(path: string, options: RequestInit = {}, apiKey: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    const errorObj = new Error(errorData.message || `HTTP error ${response.status}`);
    (errorObj as unknown as { status: number }).status = response.status;
    throw errorObj;
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export const apiClient = {
  // Health
  getHealth: (apiKey: string) => fetchWithAuth<HealthCheck>('/health', {}, apiKey),

  // Agents
  getAgents: (apiKey: string) => fetchWithAuth<Agent[]>('/agents', {}, apiKey),
  getAgent: (id: string, apiKey: string) => fetchWithAuth<Agent>(`/agents/${id}`, {}, apiKey),
  createAgent: (data: Partial<Agent>, apiKey: string) =>
    fetchWithAuth<Agent>('/agents', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }, apiKey),
  updateAgent: (id: string, data: Partial<Agent>, apiKey: string) =>
    fetchWithAuth<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }, apiKey),
  deleteAgent: (id: string, apiKey: string) => fetchWithAuth<{ message: string }>(`/agents/${id}`, { method: 'DELETE' }, apiKey),

  // Conversations
  createConversation: (
    agentId: string,
    data: { title?: string; contextPrompt?: string; ttsVoice?: string; ttsGender?: string } | string,
    apiKey: string,
  ) => {
    const body = typeof data === 'string' ? { title: data } : data;
    return fetchWithAuth<Conversation>(
      `/agents/${agentId}/conversations`,
      { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
      apiKey,
    );
  },
  getConversations: (agentId: string, apiKey: string) => fetchWithAuth<Conversation[]>(`/agents/${agentId}/conversations`, {}, apiKey),
  getMessages: (conversationId: string, apiKey: string) => fetchWithAuth<Message[]>(`/conversations/${conversationId}/messages`, {}, apiKey),
  updateConversation: (
    conversationId: string,
    data: { title?: string; contextPrompt?: string; ttsVoice?: string; ttsGender?: string },
    apiKey: string,
  ) =>
    fetchWithAuth<Conversation>(
      `/conversations/${conversationId}`,
      { method: 'PATCH', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } },
      apiKey,
    ),
  deleteConversation: (conversationId: string, apiKey: string) =>
    fetchWithAuth<{ message: string }>(`/conversations/${conversationId}`, { method: 'DELETE' }, apiKey),
  sendMessage: (conversationId: string, content: string, apiKey: string) =>
    fetchWithAuth<{ role: string; content: string }>(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content }), headers: { 'Content-Type': 'application/json' } }, apiKey),
  endConversation: (conversationId: string, apiKey: string) =>
    fetchWithAuth<Conversation>(`/conversations/${conversationId}/end`, { method: 'POST' }, apiKey),

  // Documents (RAG)
  getDocuments: (agentId: string, apiKey: string) => fetchWithAuth<DocumentItem[]>(`/agents/${agentId}/documents`, {}, apiKey),
  uploadDocument: async (agentId: string, file: File, apiKey: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchWithAuth<DocumentItem>(`/agents/${agentId}/documents`, { method: 'POST', body: formData }, apiKey);
  },
  reassignDocument: (id: string, agentId: string, apiKey: string) =>
    fetchWithAuth<DocumentItem>(
      `/documents/${id}`,
      { method: 'PATCH', body: JSON.stringify({ agentId }), headers: { 'Content-Type': 'application/json' } },
      apiKey,
    ),
  deleteDocument: (id: string, apiKey: string) => fetchWithAuth<{ message: string }>(`/documents/${id}`, { method: 'DELETE' }, apiKey),
};
