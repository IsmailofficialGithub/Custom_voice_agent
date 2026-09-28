'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent, DocumentItem } from '../../lib/api-client';
import { validatePdfFile } from '../../lib/validator';
import {
  FileText,
  UploadCloud,
  Trash2,
  Bot,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Mic,
  ArrowRightLeft,
} from 'lucide-react';

function DocumentsContent() {
  const { apiKey } = useAuth();
  const { showSuccess, showError } = useToast();
  const searchParams = useSearchParams();
  const prefillAgentId = searchParams.get('agentId') || '';

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
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
        (prefillAgentId && list.find((a) => a.id === prefillAgentId)?.id) ||
        list[0]?.id ||
        '';
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
      showError('Select an agent to assign this document to.', 'Upload');
      return;
    }
    const val = validatePdfFile(file);
    if (!val.isValid) {
      showError(val.error, 'File Upload');
      return;
    }

    setUploading(true);
    try {
      const uploaded = await apiClient.uploadDocument(selectedAgentId, file, apiKey);
      showSuccess(
        'Assigned & uploaded',
        `"${uploaded.filename}" → only ${selectedAgent?.name || 'this agent'} can read it.`,
      );
      setFile(null);
      await loadAgents();
      loadDocuments(selectedAgentId);
    } catch (err) {
      showError(err, 'PDF Upload');
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
      showError(err, 'Delete Document');
    }
  };

  const handleReassign = async (docId: string, newAgentId: string, filename: string) => {
    if (!newAgentId || newAgentId === selectedAgentId) {
      setReassigningId(null);
      return;
    }
    const target = agents.find((a) => a.id === newAgentId);
    if (!confirm(`Move “${filename}” to ${target?.name}? Only that agent will be able to read it.`)) {
      setReassigningId(null);
      return;
    }
    try {
      await apiClient.reassignDocument(docId, newAgentId, apiKey);
      showSuccess('Reassigned', `Now only ${target?.name} can access this PDF.`);
      setReassigningId(null);
      setSelectedAgentId(newAgentId);
    } catch (err) {
      showError(err, 'Reassign');
      setReassigningId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-100">
          <FileText className="h-6 w-6 text-purple-400" />
          Documents
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Upload a PDF and assign it to one agent. Only that agent can search and answer from it.
        </p>
      </div>

      {/* Upload + assign card */}
      <div className="glass-panel space-y-5 rounded-3xl border border-white/10 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-purple-500/20 p-3 text-purple-300">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Upload & assign</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Step 1: pick agent → Step 2: choose PDF → Upload
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-300">
            <Bot className="h-3.5 w-3.5" />
            Assign to agent *
          </label>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
          >
            {agents.length === 0 && <option value="">No agents — create one first</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Only <span className="font-semibold text-slate-300">{selectedAgent?.name || '…'}</span> will
            be able to read this document in chat.
          </p>
        </div>

        {!hasRag && selectedAgentId && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
            Knowledge Base is off for this agent — upload will auto-enable it. You can also edit the
            agent under{' '}
            <Link href="/agents" className="underline">
              Agents
            </Link>
            .
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-300">PDF file *</label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 transition hover:border-purple-500/50">
            <FileText className="mb-2 h-8 w-8 text-slate-500" />
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : 'Click to choose PDF'}
            </span>
            <span className="mt-1 text-[11px] text-slate-500">PDF only · max 50MB</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file || !selectedAgentId}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/25 disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : 'Upload & assign'}
          </button>
          {selectedAgentId && (
            <Link
              href={`/playground?agentId=${selectedAgentId}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Mic className="h-3.5 w-3.5" />
              Chat with {selectedAgent?.name}
            </Link>
          )}
        </div>
      </div>

      {/* Assigned docs list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-200">
            Docs for {selectedAgent?.name || 'agent'} ({documents.length})
          </h2>
          <button
            type="button"
            onClick={() => selectedAgentId && loadDocuments(selectedAgentId)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="glass-panel rounded-2xl p-8 text-center text-xs text-slate-400">
            Loading…
          </div>
        ) : documents.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-500">
            No documents for this agent yet. Upload above to assign one.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="glass-panel flex flex-col gap-3 rounded-2xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/20 p-2.5 text-purple-300">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-100">{doc.filename}</h4>
                    <p className="text-[10px] text-slate-400">
                      {new Date(doc.uploadedAt).toLocaleString()} · only {selectedAgent?.name}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {doc.status === 'ready' && (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  )}
                  {doc.status === 'processing' && (
                    <span className="inline-flex animate-pulse items-center gap-1 rounded border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      <Clock className="h-3 w-3" /> Processing
                    </span>
                  )}
                  {doc.status === 'failed' && (
                    <span className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                      <AlertCircle className="h-3 w-3" /> Failed
                    </span>
                  )}

                  {reassigningId === doc.id ? (
                    <select
                      autoFocus
                      defaultValue=""
                      onChange={(e) => handleReassign(doc.id, e.target.value, doc.filename)}
                      onBlur={() => setTimeout(() => setReassigningId(null), 200)}
                      className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
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
                      className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                      title="Reassign to another agent"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    className="rounded-xl bg-rose-950/60 p-2 text-rose-300 hover:bg-rose-900/80"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-400">Loading documents…</div>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
