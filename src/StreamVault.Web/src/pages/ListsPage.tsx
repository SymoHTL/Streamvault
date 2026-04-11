import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MediaCard from '../components/MediaCard';
import { Eye, CheckCircle, XCircle, Clock, Pause, List } from 'lucide-react';
import type { MediaListStatus } from '../types';

const STATUSES: { value: MediaListStatus | 'all'; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <List size={16} /> },
  { value: 'Watching', label: 'Watching', icon: <Eye size={16} /> },
  { value: 'Planned', label: 'Planned', icon: <Clock size={16} /> },
  { value: 'Completed', label: 'Completed', icon: <CheckCircle size={16} /> },
  { value: 'OnHold', label: 'On Hold', icon: <Pause size={16} /> },
  { value: 'Dropped', label: 'Dropped', icon: <XCircle size={16} /> },
];

export default function ListsPage() {
  const { t } = useTranslation();
  const [activeStatus, setActiveStatus] = useState<MediaListStatus | 'all'>('all');

  const { data: items, isLoading } = useQuery({
    queryKey: ['user-lists', activeStatus],
    queryFn: () => api.lists.getAll(activeStatus === 'all' ? undefined : activeStatus),
  });

  const { data: counts } = useQuery({
    queryKey: ['user-lists-counts'],
    queryFn: api.lists.counts,
  });

  const totalCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-text dark:text-text-dark">{t('nav.lists', 'My Lists')}</h1>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUSES.map((s) => {
          const count = s.value === 'all' ? totalCount : (counts?.[s.value] ?? 0);
          return (
            <button
              key={s.value}
              onClick={() => setActiveStatus(s.value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeStatus === s.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark border border-border dark:border-border-dark'
              }`}
            >
              {s.icon}
              {s.label}
              <span className={`ml-1 text-xs ${activeStatus === s.value ? 'text-white/70' : 'text-muted dark:text-muted-dark'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading && <div className="text-muted dark:text-muted-dark">Loading...</div>}

      {items && items.length === 0 && (
        <div className="text-center py-12 text-muted dark:text-muted-dark">
          <List size={48} className="mx-auto mb-3 opacity-50" />
          <p>No items in this list yet.</p>
          <p className="text-sm mt-1">Add shows and movies from their detail pages.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items?.map((entry) => (
          <div key={entry.id} className="relative">
            <MediaCard item={entry.mediaItem} />
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-white">
              {entry.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
