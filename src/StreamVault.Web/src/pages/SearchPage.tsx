import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MediaCard from '../components/MediaCard';
import { Search } from 'lucide-react';

export default function SearchPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.media.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  let debounceTimer: ReturnType<typeof setTimeout>;
  const handleChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setDebouncedQuery(value), 300);
  };

  return (
    <div>
      <div className="flex items-center gap-3 2xl:gap-5 mb-8 2xl:mb-12">
        <Search size={20} className="text-muted dark:text-muted-dark 2xl:!w-7 2xl:!h-7" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search movies & TV shows..."
          className="flex-1 px-4 py-3 2xl:px-6 2xl:py-4 rounded-xl border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-lg 2xl:text-xl focus:ring-2 focus:ring-primary outline-none"
          autoFocus
        />
      </div>

      {isLoading && <div className="text-muted dark:text-muted-dark">Searching...</div>}

      {data && (
        <div>
          {data.movies.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg 2xl:text-2xl font-semibold mb-4 2xl:mb-6 text-text dark:text-text-dark">Movies ({data.movies.length})</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-7 gap-4 2xl:gap-6">
                {data.movies.map((item) => <MediaCard key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {data.tvShows.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg 2xl:text-2xl font-semibold mb-4 2xl:mb-6 text-text dark:text-text-dark">TV Shows ({data.tvShows.length})</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-7 gap-4 2xl:gap-6">
                {data.tvShows.map((item) => <MediaCard key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {data.totalResults === 0 && debouncedQuery && (
            <div className="text-center text-muted dark:text-muted-dark py-12">
              No results found for "{debouncedQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
