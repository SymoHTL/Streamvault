import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Activity, Database, HardDrive, Users, RefreshCw, Trash2, Plus, CheckCircle, XCircle } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-sm focus:ring-2 focus:ring-primary outline-none';
const btnPrimary = 'px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors';
const btnSecondary = 'px-4 py-2 bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark text-text dark:text-text-dark rounded-lg text-sm hover:bg-border dark:hover:bg-border-dark transition-colors';

export default function AdminPage() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-text dark:text-text-dark">{t('nav.admin')}</h1>
      <DashboardSection />
      <LibrariesSection />
      <S3ConnectionsSection />
      <UsersSection />
    </div>
  );
}

function DashboardSection() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['admin-dashboard'], queryFn: api.admin.dashboard });

  if (!data) return null;

  const stats = [
    { icon: <Activity size={20} />, label: t('admin.activeStreams'), value: data.activeStreams },
    { icon: <HardDrive size={20} />, label: 'Libraries', value: data.totalLibraries },
    { icon: <Database size={20} />, label: t('admin.totalMedia'), value: data.totalMediaItems },
    { icon: <Users size={20} />, label: 'Users', value: data.totalUsers },
  ];

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">{t('admin.dashboard')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div className="flex items-center gap-2 text-muted dark:text-muted-dark mb-2">{stat.icon} <span className="text-sm">{stat.label}</span></div>
            <div className="text-2xl font-bold text-text dark:text-text-dark">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LibrariesSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: libraries } = useQuery({ queryKey: ['libraries'], queryFn: api.libraries.list });
  const { data: s3Connections } = useQuery({ queryKey: ['s3-connections'], queryFn: api.admin.s3Connections.list });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'Movie', s3ConnectionId: '', s3Prefix: '', scanScheduleCron: '0 */6 * * *' });
  const [scanFeedback, setScanFeedback] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.libraries.create({ ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      setShowForm(false);
      setForm({ name: '', type: 'Movie', s3ConnectionId: '', s3Prefix: '', scanScheduleCron: '0 */6 * * *' });
    },
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) => api.libraries.scan(id),
    onSuccess: (_data, id) => {
      setScanFeedback(prev => ({ ...prev, [id]: 'Scan triggered' }));
      setTimeout(() => setScanFeedback(prev => { const n = { ...prev }; delete n[id]; return n; }), 3000);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
    onError: (_err, id) => {
      setScanFeedback(prev => ({ ...prev, [id]: 'Scan failed' }));
      setTimeout(() => setScanFeedback(prev => { const n = { ...prev }; delete n[id]; return n; }), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.libraries.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['libraries'] }),
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">{t('admin.libraries')}</h2>
        <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
          <span className="flex items-center gap-1"><Plus size={16} /> Add Library</span>
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="Library name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputClass}>
              <option value="Movie">Movies</option>
              <option value="TvShow">TV Shows</option>
            </select>
            <select value={form.s3ConnectionId} onChange={e => setForm({ ...form, s3ConnectionId: e.target.value })} className={inputClass}>
              <option value="">Select S3 Connection</option>
              {s3Connections?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.bucket})</option>)}
            </select>
            <input placeholder="S3 Prefix (e.g. Movies/)" value={form.s3Prefix} onChange={e => setForm({ ...form, s3Prefix: e.target.value })} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.s3ConnectionId || createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
          </div>
          {createMutation.isError && <p className="text-sm text-danger">Failed to create library</p>}
        </div>
      )}

      <div className="space-y-2">
        {libraries?.map((lib) => (
          <div key={lib.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div>
              <div className="font-medium text-text dark:text-text-dark">{lib.name}</div>
              <div className="text-sm text-muted dark:text-muted-dark">
                {lib.type} · {lib.itemCount} items · {lib.scanStatus}
                {lib.lastScannedAt && <> · Last scan: {new Date(lib.lastScannedAt).toLocaleString()}</>}
              </div>
              {scanFeedback[lib.id] && <div className="text-xs text-primary mt-1">{scanFeedback[lib.id]}</div>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => scanMutation.mutate(lib.id)}
                disabled={scanMutation.isPending}
                className="p-2 rounded-lg hover:bg-border dark:hover:bg-border-dark text-primary"
                title={t('admin.scan')}
              >
                <RefreshCw size={16} className={scanMutation.isPending ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setDeleteTarget({ id: lib.id, name: lib.name })}
                className="p-2 rounded-lg hover:bg-danger/10 text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {libraries?.length === 0 && <p className="text-sm text-muted dark:text-muted-dark">No libraries yet. Add one above.</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This will remove the library and all its metadata from StreamVault. Your files on S3 will NOT be deleted."
        confirmLabel="Delete Library"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </section>
  );
}

function S3ConnectionsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: connections } = useQuery({ queryKey: ['s3-connections'], queryFn: api.admin.s3Connections.list });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', endpoint: '', bucket: '', accessKey: '', secretKey: '', region: 'us-east-1', forcePathStyle: true });
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'fail' | 'testing'>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.admin.s3Connections.create({ ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['s3-connections'] });
      setShowForm(false);
      setForm({ name: '', endpoint: '', bucket: '', accessKey: '', secretKey: '', region: 'us-east-1', forcePathStyle: true });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestResults(prev => ({ ...prev, [id]: 'testing' }));
      const res = await api.admin.s3Connections.test(id);
      return { id, status: res.status };
    },
    onSuccess: (data) => {
      setTestResults(prev => ({ ...prev, [data.id]: data.status === 'connected' ? 'ok' : 'fail' }));
      setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[data.id]; return n; }), 5000);
    },
    onError: (_err, id) => {
      setTestResults(prev => ({ ...prev, [id]: 'fail' }));
      setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[id]; return n; }), 5000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.s3Connections.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['s3-connections'] }),
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">{t('admin.s3Connections')}</h2>
        <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
          <span className="flex items-center gap-1"><Plus size={16} /> Add S3 Connection</span>
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="Connection name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Endpoint (e.g. https://s3.amazonaws.com)" value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })} className={inputClass} />
            <input placeholder="Bucket name" value={form.bucket} onChange={e => setForm({ ...form, bucket: e.target.value })} className={inputClass} />
            <input placeholder="Region (e.g. us-east-1)" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} className={inputClass} />
            <input placeholder="Access Key" value={form.accessKey} onChange={e => setForm({ ...form, accessKey: e.target.value })} className={inputClass} />
            <input type="password" placeholder="Secret Key" value={form.secretKey} onChange={e => setForm({ ...form, secretKey: e.target.value })} className={inputClass} />
          </div>
          <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
            <input type="checkbox" checked={form.forcePathStyle} onChange={e => setForm({ ...form, forcePathStyle: e.target.checked })} />
            Force path style (required for MinIO, Backblaze B2, most non-AWS providers)
          </label>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.endpoint || !form.bucket || !form.accessKey || !form.secretKey || createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
          </div>
          {createMutation.isError && <p className="text-sm text-danger">Failed to create S3 connection</p>}
        </div>
      )}

      <div className="space-y-2">
        {connections?.map((conn) => (
          <div key={conn.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div>
              <div className="font-medium text-text dark:text-text-dark">{conn.name}</div>
              <div className="text-sm text-muted dark:text-muted-dark">
                {conn.endpoint} · {conn.bucket} · {conn.region}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {testResults[conn.id] === 'ok' && <CheckCircle size={16} className="text-green-500" />}
              {testResults[conn.id] === 'fail' && <XCircle size={16} className="text-danger" />}
              <button
                onClick={() => testMutation.mutate(conn.id)}
                disabled={testResults[conn.id] === 'testing'}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
              >
                {testResults[conn.id] === 'testing' ? 'Testing...' : 'Test'}
              </button>
              <button
                onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                className="p-2 rounded-lg hover:bg-danger/10 text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {connections?.length === 0 && <p className="text-sm text-muted dark:text-muted-dark">No S3 connections yet. Add one above.</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This will remove the S3 connection. Libraries using it will stop working."
        confirmLabel="Delete Connection"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </section>
  );
}

function UsersSection() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: api.admin.users.list });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'User' });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.admin.users.create({ ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowForm(false);
      setForm({ username: '', email: '', password: '', role: 'User' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.users.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">Users</h2>
        <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
          <span className="flex items-center gap-1"><Plus size={16} /> Add User</span>
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="Username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} />
            <input type="password" placeholder="Password (min 8 chars)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={inputClass} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputClass}>
              <option value="User">User</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.username || !form.email || form.password.length < 8 || createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
            <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
          </div>
          {createMutation.isError && <p className="text-sm text-danger">Failed to create user</p>}
        </div>
      )}

      <div className="space-y-2">
        {users?.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div>
              <div className="font-medium text-text dark:text-text-dark">{user.username}</div>
              <div className="text-sm text-muted dark:text-muted-dark">{user.email} · {user.role}</div>
            </div>
            <button
              onClick={() => setDeleteTarget({ id: user.id, name: user.username })}
              className="p-2 rounded-lg hover:bg-danger/10 text-danger"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete user "${deleteTarget?.name}"?`}
        message="This will permanently remove the user account and all their data."
        confirmLabel="Delete User"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </section>
  );
}
