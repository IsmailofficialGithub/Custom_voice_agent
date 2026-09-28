'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent, DocumentItem } from '../../lib/api-client';
import { validatePdfFile } from '../../lib/validator';
import { Loading, EmptyState } from '../../components/ui/loading';
import { FileText, Trash2, Mic, ArrowRightLeft, RefreshCw } from 'lucide-react';

function DocumentsContent() {
  const { apiKey } = useAuth();
  const { showSuccess, showError } = useToast();
  const searchParams = useSearchParams();
  const prefillAgentId = searchParams.get('agentId') || '';

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, [apiKey]);

  useEffect(() => {
    if (selectedAgentId) loadDocuments(selectedAgentId);
  }, [selectedAgentId]);

  const loadAgents = async () => {
    try {
      const list = await apiClient.getAgents(apiKey);
      setAgents(list);
      const pick =
        (prefillAgentId && list.find((a) => a.id === prefillAgentId)?.id) || list[0]?.id || '';
      setSelectedAgentId(pick);
    } catch (err) {
      showError(err, 'Load Agents');
    }
  };

  const loadDocuments = async (agentId: string) => {
    setLoading(true);
    try {
      setDocuments(await apiClient.getDocuments(agentId, apiKey));
    } catch (err) {
      showError(err, 'Load Documents');
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const hasRag = selectedAgent?.enabledTools?.includes('search_knowledge_base');

  const handleUpload = async () => {
    if (!file) {
      showError('Choose a PDF first.', 'Upload');
      return;
    }
    if (!selectedAgentId) {
      showError('Select an agent.', 'Upload');
      return;
    }
    const val = validatePdfFile(file);
    if (!val.isValid) {
      showError(val.error, 'Upload');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await apiClient.uploadDocument(selectedAgentId, file, apiKey);
      showSuccess('Uploaded', `Assigned to ${selectedAgent?.name}`);
      setFile(null);
      await loadAgents();
      loadDocuments(selectedAgentId);
      void uploaded;
    } catch (err) {
      showError(err, 'Upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, filename: string) => {
    if (!confirm(`Delete “${filename}”?`)) return;
    try {
      await apiClient.deleteDocument(docId, apiKey);
      showSuccess('Deleted', filename);
      loadDocuments(selectedAgentId);
    } catch (err) {
      showError(err, 'Delete');
    }
  };

  const handleReassign = async (docId: string, newAgentId: string, filename: string) => {
    if (!newAgentId || newAgentId === selectedAgentId) {
      setReassigningId(null);
      return;
    }
    const target = agents.find((a) => a.id === newAgentId);
    if (!confirm(`Move “${filename}” to ${target?.name}?`)) {
      setReassigningId(null);
      return;
    }
    try {
      await apiClient.reassignDocument(docId, newAgentId, apiKey);
      showSuccess('Moved', target?.name || '');
      setReassigningId(null);
      setSelectedAgentId(newAgentId);
    } catch (err) {
      showError(err, 'Reassign');
      setReassigningId(null);
    }
  };

  return (
    <div className="ui-page space-y-6">
      <div>
        <h1 className="ui-title">Documents</h1>
        <p className="ui-subtitle">Upload a PDF and assign it to one agent. Only that agent can read it.</p>
      </div>

      <section className="space-y-4 rounded-lg border border-[var(--border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Upload & assign</h2>

        <div>
          <label className="ui-label">Agent</label>
          <select
            className="ui-input"
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
          >
            {agents.length === 0 && <option value="">Create an agent first</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
            Only {selectedAgent?.name || '…'} will search this file.
          </p>
        </div>

        {!hasRag && selectedAgentId && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--warn)]">
            Document search is off for this agent — upload will turn it on, or enable it under Agents.
          </p>
        )}

        <div>
          <label className="ui-label">PDF</label>
          <label className="flex cursor-pointer flex-col items-center rounded-md border border-dashed border-[var(--border)] px-4 py-8 text-center hover:border-[var(--border-strong)]">
            <FileText className="mb-2 h-6 w-6 text-[var(--text-faint)]" />
            <span className="text-sm text-[var(--text)]">{file ? file.name : 'Choose PDF'}</span>
            <span className="mt-1 text-[11px] text-[var(--text-faint)]">PDF · max 50MB</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file || !selectedAgentId}
            className="ui-btn ui-btn-primary"
          >
            {uploading ? 'Uploading…' : 'Upload & assign'}
          </button>
          {selectedAgentId && (
            <Link href={`/playground?agentId=${selectedAgentId}`} className="ui-btn ui-btn-ghost">
              <Mic className="h-3.5 w-3.5" />
              Chat
            </Link>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Files for {selectedAgent?.name || 'agent'}
          </h2>
          <button
            type="button"
            onClick={() => selectedAgentId && loadDocuments(selectedAgentId)}
            className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <Loading label="Loading documents" />
        ) : documents.length === 0 ? (
          <EmptyState title="No documents" body="Upload a PDF above to assign it to this agent." />
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{doc.filename}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    {new Date(doc.uploadedAt).toLocaleString()} · {doc.status}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {reassigningId === doc.id ? (
                    <select
                      autoFocus
                      defaultValue=""
                      className="ui-input w-auto py-1.5 text-xs"
                      onChange={(e) => handleReassign(doc.id, e.target.value, doc.filename)}
                      onBlur={() => setTimeout(() => setReassigningId(null), 200)}
                    >
                      <option value="">Move to…</option>
                      {agents
                        .filter((a) => a.id !== selectedAgentId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReassigningId(doc.id)}
                      className="ui-btn ui-btn-ghost"
                      title="Reassign"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    className="ui-btn ui-btn-ghost text-[var(--danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<Loading label="Loading documents" />}>
      <DocumentsContent />
    </Suspense>
  );
}
