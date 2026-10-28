'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent, ManagedUser } from '../../lib/api-client';
import { validateEmail, validatePassword } from '../../lib/validator';
import { Loading, EmptyState } from '../../components/ui/loading';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';

export default function UsersPage() {
  const { apiKey, currentUser } = useAuth();
  const { showError, showSuccess } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'operator' });

  useEffect(() => {
    if (!apiKey) return;
    Promise.all([apiClient.getUsers(apiKey), apiClient.getAgents(apiKey)])
      .then(([u, a]) => {
        setUsers(u);
        setAgents(a);
      })
      .catch((err) => showError(err, 'Users'))
      .finally(() => setLoading(false));
  }, [apiKey]);

  if (currentUser.role !== 'admin') {
    return <div className="ui-page"><EmptyState title="Admins only" body="You need admin access to manage users." /></div>;
  }

  const replace = (u: ManagedUser) => setUsers((list) => list.map((x) => (x.id === u.id ? u : x)));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = validateEmail(form.email);
    if (!emailCheck.isValid) return showError(new Error(emailCheck.error), 'Users');
    const pwCheck = validatePassword(form.password);
    if (!pwCheck.isValid) return showError(new Error(pwCheck.error), 'Users');
    try {
      const created = await apiClient.createUser(form, apiKey);
      setUsers((list) => [...list, created]);
      setForm({ email: '', name: '', password: '', role: 'operator' });
      showSuccess('User created', created.email);
    } catch (err) {
      showError(err, 'Users');
    }
  };

  const update = async (u: ManagedUser, data: { role?: string; assignedAgentIds?: string[] }) => {
    try {
      replace(await apiClient.updateUser(u.id, data, apiKey));
    } catch (err) {
      showError(err, 'Users');
    }
  };

  const toggleAgent = (u: ManagedUser, agentId: string) =>
    update(u, {
      assignedAgentIds: u.assignedAgentIds.includes(agentId)
        ? u.assignedAgentIds.filter((id) => id !== agentId)
        : [...u.assignedAgentIds, agentId],
    });

  const resetPassword = async (u: ManagedUser) => {
    const password = window.prompt(`New password for ${u.email}`);
    if (!password) return;
    const check = validatePassword(password);
    if (!check.isValid) return showError(new Error(check.error), 'Users');
    try {
      await apiClient.resetUserPassword(u.id, password, apiKey);
      showSuccess('Password reset', u.email);
    } catch (err) {
      showError(err, 'Users');
    }
  };

  const remove = async (u: ManagedUser) => {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try {
      await apiClient.deleteUser(u.id, apiKey);
      setUsers((list) => list.filter((x) => x.id !== u.id));
    } catch (err) {
      showError(err, 'Users');
    }
  };

  return (
    <div className="ui-page space-y-6">
      <div>
        <h1 className="ui-title">Users</h1>
        <p className="ui-subtitle">Add users, set roles and choose which agents each user can access. Admins see every agent.</p>
      </div>

      <form onSubmit={handleCreate} className="glass-panel rounded-xl p-5 grid gap-3 sm:grid-cols-5 sm:items-end">
        <label className="sm:col-span-2">
          <span className="ui-label">Email</span>
          <input className="ui-input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          <span className="ui-label">Name</span>
          <input className="ui-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          <span className="ui-label">Password</span>
          <input className="ui-input" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <label>
          <span className="ui-label">Role</span>
          <select className="ui-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <div className="sm:col-span-5">
          <button type="submit" className="ui-btn ui-btn-primary"><UserPlus className="h-4 w-4" /> Add user</button>
        </div>
      </form>

      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState title="No users" body="Add the first user above." />
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">{u.name || u.email}</div>
                  <div className="truncate text-xs text-[var(--text-muted)]">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="ui-input w-auto"
                    value={u.role}
                    disabled={u.id === currentUser.id}
                    onChange={(e) => update(u, { role: e.target.value })}
                    aria-label={`Role for ${u.email}`}
                  >
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="button" className="ui-btn ui-btn-ghost px-2.5" title="Reset password" onClick={() => resetPassword(u)}>
                    <KeyRound className="h-4 w-4" />
                  </button>
                  {u.id !== currentUser.id && (
                    <button type="button" className="ui-btn ui-btn-ghost px-2.5 text-[var(--danger)]" title="Delete user" onClick={() => remove(u)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {u.role === 'admin' ? (
                <p className="text-xs text-[var(--text-muted)]">Admins have access to all agents.</p>
              ) : (
                <div>
                  <span className="ui-label">Assigned agents</span>
                  {agents.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">No agents yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {agents.map((a) => (
                        <label key={a.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text)]">
                          <input type="checkbox" checked={u.assignedAgentIds.includes(a.id)} onChange={() => toggleAgent(u, a.id)} />
                          {a.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
