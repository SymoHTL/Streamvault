import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Activity, Database, HardDrive, Users, RefreshCw, Trash2 } from 'lucide-react';

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

  const scanMutation = useMutation({
    mutationFn: (id: string) => api.libraries.scan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['libraries'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.libraries.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['libraries'] }),
  });

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">{t('admin.libraries')}</h2>
      <div className="space-y-2">
        {libraries?.map((lib) => (
          <div key={lib.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div>
              <div className="font-medium text-text dark:text-text-dark">{lib.name}</div>
              <div className="text-sm text-muted dark:text-muted-dark">
                {lib.type} · {lib.itemCount} items · {lib.scanStatus}
              </div>
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
                onClick={() => { if (confirm('Delete this library?')) deleteMutation.mutate(lib.id); }}
                className="p-2 rounded-lg hover:bg-danger/10 text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function S3ConnectionsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: connections } = useQuery({ queryKey: ['s3-connections'], queryFn: api.admin.s3Connections.list });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.admin.s3Connections.test(id),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.s3Connections.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['s3-connections'] }),
  });

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">{t('admin.s3Connections')}</h2>
      <div className="space-y-2">
        {connections?.map((conn) => (
          <div key={conn.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div>
              <div className="font-medium text-text dark:text-text-dark">{conn.name}</div>
              <div className="text-sm text-muted dark:text-muted-dark">
                {conn.endpoint} · {conn.bucket} · {conn.region}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => testMutation.mutate(conn.id)}
                disabled={testMutation.isPending}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
              >
                {testMutation.isPending ? '...' : 'Test'}
              </button>
              <button
                onClick={() => { if (confirm('Delete this connection?')) deleteMutation.mutate(conn.id); }}
                className="p-2 rounded-lg hover:bg-danger/10 text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsersSection() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: api.admin.users.list });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.users.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">Users</h2>
      <div className="space-y-2">
        {users?.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
            <div>
              <div className="font-medium text-text dark:text-text-dark">{user.username}</div>
              <div className="text-sm text-muted dark:text-muted-dark">{user.email} · {user.role}</div>
            </div>
            <button
              onClick={() => { if (confirm(`Delete user ${user.username}?`)) deleteMutation.mutate(user.id); }}
              className="p-2 rounded-lg hover:bg-danger/10 text-danger"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
