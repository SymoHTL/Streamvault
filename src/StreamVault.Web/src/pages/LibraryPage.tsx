import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MediaCard from '../components/MediaCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function LibraryPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') || '1');
  const sort = searchParams.get('sort') || 'title';
  const genre = searchParams.get('genre') || '';
  const search = searchParams.get('search') || '';

  const { data: library } = useQuery({
    queryKey: ['library', id],
    queryFn: () => api.libraries.get(id!),
    enabled: !!id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['library-items', id, page, sort, genre, search],
    queryFn: () => api.libraries.items(id!, { page, pageSize: 24, sort, genre, search }),
    enabled: !!id,
  });

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    setSearchParams(params);
  };

  const totalPages = data ? Math.ceil(data.totalCount / data.pageSize) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-text-dark">{library?.name || t('nav.libraries')}</h1>
          {data && <p className="text-sm text-muted dark:text-muted-dark">{data.totalCount} {t('library.items')}</p>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          placeholder={t('library.search')}
          value={search}
          onChange={(e) => updateParam('search', e.target.value)}
          className="px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-sm w-48 focus:ring-2 focus:ring-primary outline-none"
        />
        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-sm"
        >
          <option value="title">{t('library.title')}</option>
          <option value="year">{t('library.year')}</option>
          <option value="rating">{t('library.rating')}</option>
          <option value="added">{t('library.recentlyAdded')}</option>
        </select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-pulse">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg bg-surface-secondary dark:bg-surface-secondary-dark" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {data?.items.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => updateParam('page', String(page - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg hover:bg-border dark:hover:bg-border-dark disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-muted dark:text-muted-dark">
            {t('library.page', { current: page, total: totalPages })}
          </span>
          <button
            onClick={() => updateParam('page', String(page + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg hover:bg-border dark:hover:bg-border-dark disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
