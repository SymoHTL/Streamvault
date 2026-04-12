import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { S3ConnectionResponse, LibraryResponse } from '../types';
import { Activity, Database, HardDrive, Users, RefreshCw, Trash2, Plus, CheckCircle, XCircle, Pencil, Key } from 'lucide-react';
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
    { icon: <HardDrive size={20} />, label: t('admin.libraries'), value: data.totalLibraries },
    { icon: <Database size={20} />, label: t('admin.totalMedia'), value: data.totalMediaItems },
    { icon: <Users size={20} />, label: t('admin.users'), value: data.totalUsers },
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
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', type: '', s3ConnectionId: '', s3Prefix: '', scanScheduleCron: '' });

  const createMutation = useMutation({
    mutationFn: () => api.libraries.create({ ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      setShowForm(false);
      setForm({ name: '', type: 'Movie', s3ConnectionId: '', s3Prefix: '', scanScheduleCron: '0 */6 * * *' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => api.admin.libraries.update(id, { ...editForm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      setEditTarget(null);
    },
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) => api.libraries.scan(id),
    onSuccess: (_data, id) => {
      setScanFeedback(prev => ({ ...prev, [id]: t('admin.scanTriggered') }));
      setTimeout(() => setScanFeedback(prev => { const n = { ...prev }; delete n[id]; return n; }), 3000);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
    onError: (_err, id) => {
      setScanFeedback(prev => ({ ...prev, [id]: t('admin.scanFailed') }));
      setTimeout(() => setScanFeedback(prev => { const n = { ...prev }; delete n[id]; return n; }), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.libraries.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['libraries'] }),
  });

  const startEdit = (lib: LibraryResponse) => {
    setEditTarget(lib.id);
    setEditForm({ name: lib.name, type: lib.type, s3ConnectionId: lib.s3ConnectionId, s3Prefix: lib.s3Prefix, scanScheduleCron: lib.scanScheduleCron });
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">{t('admin.libraries')}</h2>
        <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
          <span className="flex items-center gap-1"><Plus size={16} /> {t('admin.addLibrary')}</span>
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder={t('admin.libraryName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputClass}>
              <option value="Movie">{t('admin.movies')}</option>
              <option value="TvShow">{t('admin.tvShows')}</option>
            </select>
            <select value={form.s3ConnectionId} onChange={e => setForm({ ...form, s3ConnectionId: e.target.value })} className={inputClass}>
              <option value="">{t('admin.selectS3')}</option>
              {s3Connections?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.bucket})</option>)}
            </select>
            <input placeholder={t('admin.s3Prefix')} value={form.s3Prefix} onChange={e => setForm({ ...form, s3Prefix: e.target.value })} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.s3ConnectionId || createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? t('admin.creating') : t('admin.create')}
            </button>
            <button onClick={() => setShowForm(false)} className={btnSecondary}>{t('admin.cancel')}</button>
          </div>
          {createMutation.isError && <p className="text-sm text-danger">{t('admin.createFailed')}</p>}
        </div>
      )}

      <div className="space-y-2">
        {libraries?.map((lib) => (
          <div key={lib.id} className="rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-text dark:text-text-dark">{lib.name}</div>
                <div className="text-sm text-muted dark:text-muted-dark">
                  {lib.type} · {lib.itemCount} {t('library.items')} · {lib.scanStatus}
                  {lib.lastScannedAt && <> · {t('admin.lastScan')}: {new Date(lib.lastScannedAt).toLocaleString()}</>}
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
                <button onClick={() => startEdit(lib)} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title={t('admin.edit')}>
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: lib.id, name: lib.name })}
                  className="p-2 rounded-lg hover:bg-danger/10 text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {editTarget === lib.id && (
              <div className="p-4 border-t border-border dark:border-border-dark space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input placeholder={t('admin.libraryName')} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                  <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className={inputClass}>
                    <option value="Movie">{t('admin.movies')}</option>
                    <option value="TvShow">{t('admin.tvShows')}</option>
                  </select>
                  <select value={editForm.s3ConnectionId} onChange={e => setEditForm({ ...editForm, s3ConnectionId: e.target.value })} className={inputClass}>
                    <option value="">{t('admin.selectS3')}</option>
                    {s3Connections?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.bucket})</option>)}
                  </select>
                  <input placeholder={t('admin.s3Prefix')} value={editForm.s3Prefix} onChange={e => setEditForm({ ...editForm, s3Prefix: e.target.value })} className={inputClass} />
                  <input placeholder={t('admin.scanSchedule')} value={editForm.scanScheduleCron} onChange={e => setEditForm({ ...editForm, scanScheduleCron: e.target.value })} className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateMutation.mutate(lib.id)} disabled={!editForm.name || !editForm.s3ConnectionId || updateMutation.isPending} className={btnPrimary}>
                    {updateMutation.isPending ? t('admin.saving') : t('admin.save')}
                  </button>
                  <button onClick={() => setEditTarget(null)} className={btnSecondary}>{t('admin.cancel')}</button>
                </div>
                {updateMutation.isError && <p className="text-sm text-danger">{t('admin.updateFailed')}</p>}
              </div>
            )}
          </div>
        ))}
        {libraries?.length === 0 && <p className="text-sm text-muted dark:text-muted-dark">{t('admin.noLibraries')}</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('admin.deleteS3', { name: deleteTarget?.name })}
        message={t('admin.deleteLibraryMsg')}
        confirmLabel={t('admin.deleteLibrary')}
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
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', endpoint: '', bucket: '', accessKey: '', secretKey: '', region: '', forcePathStyle: true });
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.admin.s3Connections.create({ ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['s3-connections'] });
      setShowForm(false);
      setForm({ name: '', endpoint: '', bucket: '', accessKey: '', secretKey: '', region: 'us-east-1', forcePathStyle: true });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => api.admin.s3Connections.update(id, { ...editForm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['s3-connections'] });
      setEditTarget(null);
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
    mutationFn: ({ id, force }: { id: string; force: boolean }) => api.admin.s3Connections.delete(id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['s3-connections'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      setDeleteError(null);
    },
    onError: () => setDeleteError(t('admin.createFailed')),
  });

  const startEdit = (conn: S3ConnectionResponse) => {
    setEditTarget(conn.id);
    setEditForm({ name: conn.name, endpoint: conn.endpoint, bucket: conn.bucket, accessKey: '', secretKey: '', region: conn.region, forcePathStyle: conn.forcePathStyle });
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">{t('admin.s3Connections')}</h2>
        <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
          <span className="flex items-center gap-1"><Plus size={16} /> {t('admin.addS3')}</span>
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder={t('admin.connectionName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder={t('admin.endpoint')} value={form.endpoint} onChange={e => setForm({ ...form, endpoint: e.target.value })} className={inputClass} />
            <input placeholder={t('admin.bucket')} value={form.bucket} onChange={e => setForm({ ...form, bucket: e.target.value })} className={inputClass} />
            <input placeholder={t('admin.region')} value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} className={inputClass} />
            <input placeholder={t('admin.accessKey')} value={form.accessKey} onChange={e => setForm({ ...form, accessKey: e.target.value })} className={inputClass} />
            <input type="password" placeholder={t('admin.secretKey')} value={form.secretKey} onChange={e => setForm({ ...form, secretKey: e.target.value })} className={inputClass} />
          </div>
          <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
            <input type="checkbox" checked={form.forcePathStyle} onChange={e => setForm({ ...form, forcePathStyle: e.target.checked })} />
            {t('admin.forcePathStyle')}
          </label>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.endpoint || !form.bucket || !form.accessKey || !form.secretKey || createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? t('admin.creating') : t('admin.create')}
            </button>
            <button onClick={() => setShowForm(false)} className={btnSecondary}>{t('admin.cancel')}</button>
          </div>
          {createMutation.isError && <p className="text-sm text-danger">{t('admin.createFailed')}</p>}
        </div>
      )}

      <div className="space-y-2">
        {connections?.map((conn) => (
          <div key={conn.id} className="rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div className="flex items-center justify-between p-4">
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
                  {testResults[conn.id] === 'testing' ? t('admin.testing') : t('admin.test')}
                </button>
                <button onClick={() => startEdit(conn)} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title={t('admin.edit')}>
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                  className="p-2 rounded-lg hover:bg-danger/10 text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {editTarget === conn.id && (
              <div className="p-4 border-t border-border dark:border-border-dark space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input placeholder={t('admin.connectionName')} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                  <input placeholder={t('admin.endpoint')} value={editForm.endpoint} onChange={e => setEditForm({ ...editForm, endpoint: e.target.value })} className={inputClass} />
                  <input placeholder={t('admin.bucket')} value={editForm.bucket} onChange={e => setEditForm({ ...editForm, bucket: e.target.value })} className={inputClass} />
                  <input placeholder={t('admin.region')} value={editForm.region} onChange={e => setEditForm({ ...editForm, region: e.target.value })} className={inputClass} />
                  <input placeholder={`${t('admin.accessKey')} (${t('admin.keepEmpty')})`} value={editForm.accessKey} onChange={e => setEditForm({ ...editForm, accessKey: e.target.value })} className={inputClass} />
                  <input type="password" placeholder={`${t('admin.secretKey')} (${t('admin.keepEmpty')})`} value={editForm.secretKey} onChange={e => setEditForm({ ...editForm, secretKey: e.target.value })} className={inputClass} />
                </div>
                <label className="flex items-center gap-2 text-sm text-text dark:text-text-dark">
                  <input type="checkbox" checked={editForm.forcePathStyle} onChange={e => setEditForm({ ...editForm, forcePathStyle: e.target.checked })} />
                  {t('admin.forcePathStyle')}
                </label>
                <div className="flex gap-2">
                  <button onClick={() => updateMutation.mutate(conn.id)} disabled={!editForm.name || !editForm.endpoint || !editForm.bucket || updateMutation.isPending} className={btnPrimary}>
                    {updateMutation.isPending ? t('admin.saving') : t('admin.save')}
                  </button>
                  <button onClick={() => setEditTarget(null)} className={btnSecondary}>{t('admin.cancel')}</button>
                </div>
                {updateMutation.isError && <p className="text-sm text-danger">{t('admin.updateFailed')}</p>}
              </div>
            )}
          </div>
        ))}
        {connections?.length === 0 && <p className="text-sm text-muted dark:text-muted-dark">{t('admin.noS3')}</p>}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('admin.deleteS3', { name: deleteTarget?.name })}
        message={t('admin.deleteS3Msg')}
        confirmLabel={t('admin.forceDelete')}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id, force: true }); setDeleteTarget(null); }}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        variant="danger"
      />
      {deleteError && <p className="text-sm text-danger mt-2">{deleteError}</p>}
    </section>
  );
}

function UsersSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: api.admin.users.list });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'User' });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: '', email: '', password: '', role: '' });

  const createMutation = useMutation({
    mutationFn: () => api.admin.users.create({ ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowForm(false);
      setForm({ username: '', email: '', password: '', role: 'User' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => {
      const data: Record<string, unknown> = {};
      if (editForm.username) data.username = editForm.username;
      if (editForm.email) data.email = editForm.email;
      if (editForm.password) data.password = editForm.password;
      if (editForm.role) data.role = editForm.role;
      return api.admin.users.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.users.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const startEdit = (user: { id: string; username: string; email: string; role: string }) => {
    setEditTarget(user.id);
    setEditForm({ username: user.username, email: user.email, password: '', role: user.role });
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text dark:text-text-dark">{t('admin.users')}</h2>
        <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
          <span className="flex items-center gap-1"><Plus size={16} /> {t('admin.addUser')}</span>
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder={t('auth.username')} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className={inputClass} />
            <input type="email" placeholder={t('settings.email')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} />
            <input type="password" placeholder={t('admin.passwordMin')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={inputClass} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputClass}>
              <option value="User">User</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.username || !form.email || form.password.length < 8 || createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? t('admin.creating') : t('admin.addUser')}
            </button>
            <button onClick={() => setShowForm(false)} className={btnSecondary}>{t('admin.cancel')}</button>
          </div>
          {createMutation.isError && <p className="text-sm text-danger">{t('admin.createFailed')}</p>}
        </div>
      )}

      <div className="space-y-2">
        {users?.map((user) => (
          <div key={user.id} className="rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-text dark:text-text-dark">{user.username}</div>
                <div className="text-sm text-muted dark:text-muted-dark">{user.email} · {user.role}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(user)} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title={t('admin.edit')}>
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: user.id, name: user.username })}
                  className="p-2 rounded-lg hover:bg-danger/10 text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {editTarget === user.id && (
              <div className="p-4 border-t border-border dark:border-border-dark space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input placeholder={t('auth.username')} value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} className={inputClass} />
                  <input type="email" placeholder={t('settings.email')} value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
                  <div className="relative">
                    <input type="password" placeholder={t('admin.newPassword')} value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} className={inputClass} />
                    <Key size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted dark:text-muted-dark" />
                  </div>
                  <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} className={inputClass}>
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateMutation.mutate(user.id)} disabled={updateMutation.isPending} className={btnPrimary}>
                    {updateMutation.isPending ? t('admin.saving') : t('admin.save')}
                  </button>
                  <button onClick={() => setEditTarget(null)} className={btnSecondary}>{t('admin.cancel')}</button>
                </div>
                {updateMutation.isError && <p className="text-sm text-danger">{t('admin.updateFailed')}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('admin.deleteUser', { name: deleteTarget?.name })}
        message={t('admin.deleteUserMsg')}
        confirmLabel={t('admin.delete')}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </section>
  );
}
