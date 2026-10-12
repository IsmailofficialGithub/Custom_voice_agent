'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent, CallLogItem, Message } from '../../lib/api-client';
import {
  Users,
  Phone,
  Mail,
  Flame,
  Search,
  Filter,
  RefreshCw,
  X,
  FileSpreadsheet,
  Clock,
  Bot,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';

export default function LeadsAndCallLogsPage() {
  const { apiKey } = useAuth();
  const { showError } = useToast();

  const [logs, setLogs] = useState<CallLogItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [selectedInterest, setSelectedInterest] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected call for modal
  const [activeCall, setActiveCall] = useState<CallLogItem | null>(null);
  const [callMessages, setCallMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    loadData();
  }, [apiKey]);

  const loadData = async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [fetchedLogs, fetchedAgents] = await Promise.all([
        apiClient.getCallLogs(apiKey),
        apiClient.getAgents(apiKey).catch(() => []),
      ]);
      setLogs(fetchedLogs);
      setAgents(fetchedAgents);
    } catch (err) {
      showError(err, 'Load Leads & Logs');
    } finally {
      setLoading(false);
    }
  };

  const openCallDetails = async (call: CallLogItem) => {
    setActiveCall(call);
    setLoadingMessages(true);
    try {
      const msgs = await apiClient.getMessages(call.id, apiKey);
      setCallMessages(msgs.filter((m) => m.role === 'user' || m.role === 'assistant'));
    } catch {
      setCallMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const closeCallDetails = () => {
    setActiveCall(null);
    setCallMessages([]);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedAgentId !== 'all' && log.agentId !== selectedAgentId) return false;
      if (selectedInterest !== 'all') {
        const interest = log.callSummary?.leadInterest?.toLowerCase() || 'none';
        if (selectedInterest.toLowerCase() !== interest) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const leadName = log.callSummary?.leadName?.toLowerCase() || '';
        const email = log.callSummary?.leadEmail?.toLowerCase() || '';
        const phone = log.callSummary?.leadPhone?.toLowerCase() || '';
        const summary = log.callSummary?.summary?.toLowerCase() || '';
        const title = log.title?.toLowerCase() || '';
        const agentName = log.agentName?.toLowerCase() || '';
        if (
          !leadName.includes(query) &&
          !email.includes(query) &&
          !phone.includes(query) &&
          !summary.includes(query) &&
          !title.includes(query) &&
          !agentName.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedAgentId, selectedInterest, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalCalls = logs.length;
    const hotLeads = logs.filter(
      (l) => l.callSummary?.leadInterest?.toLowerCase() === 'high',
    ).length;
    const capturedContacts = logs.filter(
      (l) => Boolean(l.callSummary?.leadEmail || l.callSummary?.leadPhone),
    ).length;
    const validDurations = logs
      .map((l) => l.durationSeconds)
      .filter((d): d is number => typeof d === 'number' && d > 0)
      .map((d) => Math.min(1800, d));
    const avgDurationSeconds =
      validDurations.length > 0
        ? Math.round(
            validDurations.reduce((acc, d) => acc + d, 0) / validDurations.length,
          )
        : 0;
    return { totalCalls, hotLeads, capturedContacts, avgDurationSeconds };
  }, [logs]);

  const interestBadge = (level?: string) => {
    const l = level?.toLowerCase();
    if (l === 'high') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 shadow-sm">
          🔥 Hot Lead
        </span>
      );
    }
    if (l === 'medium') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-xs font-semibold text-amber-400 shadow-sm">
          ⚡ Warm Lead
        </span>
      );
    }
    if (l === 'low') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/40 px-2.5 py-0.5 text-xs font-semibold text-blue-400 shadow-sm">
          💧 Mild Interest
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
        Not Interested
      </span>
    );
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '—';
    if (seconds >= 3600) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hrs}h ${mins}m ${secs}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Leads & Call Logs</h1>
              <p className="text-xs text-[var(--text-muted)]">
                Real-time extracted prospect intelligence, captured contacts, and call summaries
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--border)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Calls</span>
            <Phone className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalCalls}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Recorded voice sessions</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Hot Leads</span>
            <Flame className="h-4 w-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400">{stats.hotLeads}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">High buying intent</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Contacts Captured</span>
            <Mail className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-400">{stats.capturedContacts}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Emails or phone numbers</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Avg Call Length</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white">{formatDuration(stats.avgDurationSeconds)}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Session duration</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by lead name, email, phone number, summary..."
            className="w-full rounded-lg border border-[var(--border)] bg-zinc-950/70 pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Filter className="h-3.5 w-3.5" />
            <span>Agent:</span>
          </div>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-zinc-950/70 px-3 py-2 text-xs text-zinc-200 focus:outline-none"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 ml-2">
            <span>Interest:</span>
          </div>
          <select
            value={selectedInterest}
            onChange={(e) => setSelectedInterest(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-zinc-950/70 px-3 py-2 text-xs text-zinc-200 focus:outline-none"
          >
            <option value="all">All Interests</option>
            <option value="high">High (Hot)</option>
            <option value="medium">Medium (Warm)</option>
            <option value="low">Low (Mild)</option>
            <option value="not interested">Not Interested</option>
          </select>
        </div>
      </div>

      {/* Main Leads & Calls Data Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-sm text-zinc-400">Loading call records & leads…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
            <h3 className="text-sm font-semibold text-zinc-300">No Call Logs Found</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {logs.length === 0
                ? 'Make your first voice call in the Chat tab to start generating leads and transcripts.'
                : 'No calls match your active filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] bg-zinc-950/50 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-4 py-3.5">Date & Duration</th>
                  <th className="px-4 py-3.5">Agent</th>
                  <th className="px-4 py-3.5">Lead / Contact Info</th>
                  <th className="px-4 py-3.5">Interest Level</th>
                  <th className="px-4 py-3.5">Product Discussed</th>
                  <th className="px-4 py-3.5">Executive Summary</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-zinc-200">
                {filteredLogs.map((log) => {
                  const summary = log.callSummary;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => openCallDetails(log)}
                      className="cursor-pointer transition hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-white">{formatDate(log.startedAt)}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {formatDuration(log.durationSeconds)} · {log.messageCount || 0} turns
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-200">
                          <Bot className="h-3 w-3 text-emerald-400" />
                          {log.agentName || 'Agent'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">
                          {summary?.leadName || <span className="text-zinc-500 italic">Anonymous</span>}
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                          {summary?.leadEmail && (
                            <a
                              href={`mailto:${summary.leadEmail}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                            >
                              <Mail className="h-3 w-3" />
                              {summary.leadEmail}
                            </a>
                          )}
                          {summary?.leadPhone && (
                            <a
                              href={`tel:${summary.leadPhone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-zinc-300 hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {summary.leadPhone}
                            </a>
                          )}
                          {!summary?.leadEmail && !summary?.leadPhone && (
                            <span className="text-zinc-500 italic">No contact details</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {interestBadge(summary?.leadInterest)}
                      </td>

                      <td className="px-4 py-3 max-w-[140px] truncate">
                        <span className="text-zinc-300">{summary?.productPitched || 'Sales Offer'}</span>
                      </td>

                      <td className="px-4 py-3 max-w-xs truncate">
                        <p className="line-clamp-2 text-zinc-300" title={summary?.summary || ''}>
                          {summary?.summary || 'Call logged'}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCallDetails(log);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-zinc-900/60 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                        >
                          <span>Details</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Call & Verbatim Transcript Modal */}
      {activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 bg-zinc-950/40">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {activeCall.title || 'Call Details'}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {formatDate(activeCall.startedAt)} · Agent: {activeCall.agentName || 'Agent'} · Duration:{' '}
                    {formatDuration(activeCall.durationSeconds)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCallDetails}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Lead Summary Table */}
              <div className="rounded-xl border border-white/10 bg-zinc-950/60 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 border-b border-white/10">
                  <span className="font-semibold text-xs text-zinc-200">Extracted Lead Information</span>
                  {interestBadge(activeCall.callSummary?.leadInterest)}
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="w-48 px-4 py-2.5 font-medium text-zinc-400 bg-zinc-900/40">Lead Name</td>
                      <td className="px-4 py-2.5 font-semibold text-white">
                        {activeCall.callSummary?.leadName || <span className="text-zinc-500 italic">Not stated</span>}
                      </td>
                    </tr>
                    <tr>
                      <td className="w-48 px-4 py-2.5 font-medium text-zinc-400 bg-zinc-900/40">Email</td>
                      <td className="px-4 py-2.5 text-white">
                        {activeCall.callSummary?.leadEmail ? (
                          <a
                            href={`mailto:${activeCall.callSummary.leadEmail}`}
                            className="text-emerald-400 hover:underline"
                          >
                            {activeCall.callSummary.leadEmail}
                          </a>
                        ) : (
                          <span className="text-zinc-500 italic">Not captured</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="w-48 px-4 py-2.5 font-medium text-zinc-400 bg-zinc-900/40">Phone</td>
                      <td className="px-4 py-2.5 text-white">
                        {activeCall.callSummary?.leadPhone ? (
                          <a
                            href={`tel:${activeCall.callSummary.leadPhone}`}
                            className="text-emerald-400 hover:underline"
                          >
                            {activeCall.callSummary.leadPhone}
                          </a>
                        ) : (
                          <span className="text-zinc-500 italic">Not captured</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="w-48 px-4 py-2.5 font-medium text-zinc-400 bg-zinc-900/40">Product Pitched</td>
                      <td className="px-4 py-2.5 text-zinc-200">
                        {activeCall.callSummary?.productPitched || 'Sales Offer'}
                      </td>
                    </tr>
                    <tr>
                      <td className="w-48 px-4 py-2.5 font-medium text-zinc-400 bg-zinc-900/40">Next Steps</td>
                      <td className="px-4 py-2.5 font-medium text-emerald-300">
                        {activeCall.callSummary?.nextSteps || 'Follow up with prospect'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Executive Summary */}
              {activeCall.callSummary?.summary && (
                <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Executive Summary
                  </h4>
                  <p className="text-sm text-zinc-200 leading-relaxed">
                    {activeCall.callSummary.summary}
                  </p>
                </div>
              )}

              {/* Verbatim Transcript */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Verbatim Call Transcript
                </h4>
                {loadingMessages ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">Loading transcript…</p>
                ) : callMessages.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">No transcript messages recorded.</p>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-2">
                    {callMessages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-zinc-800 text-white'
                              : 'bg-zinc-950 border border-white/10 text-zinc-200'
                          }`}
                        >
                          <span className="block font-semibold text-[10px] text-zinc-400 mb-0.5">
                            {m.role === 'user' ? 'Customer / Lead' : activeCall.agentName || 'Agent'}
                          </span>
                          <p>{m.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-zinc-800 px-6 py-3 bg-zinc-950/40 flex justify-end">
              <button
                type="button"
                onClick={closeCallDetails}
                className="rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-zinc-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
