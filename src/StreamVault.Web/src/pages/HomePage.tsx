import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MediaRow from '../components/MediaRow';
import { Link } from 'react-router-dom';
import { Play, Star } from 'lucide-react';

export default function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: api.home });

  if (isLoading) return <div className="text-muted dark:text-muted-dark">Loading...</div>;
  if (!data) return null;

  return (
    <div>
      {/* Featured Hero */}
      {data.featuredItem && (
        <section className="mb-8 relative rounded-2xl overflow-hidden bg-surface-secondary dark:bg-surface-secondary-dark">
          {data.featuredItem.posterPath && (
            <img
              src={data.featuredItem.posterPath}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-20"
            />
          )}
          <div className="relative p-8 flex items-end min-h-[300px]">
            <div>
              <h1 className="text-3xl font-bold text-text dark:text-text-dark mb-2">{data.featuredItem.title}</h1>
              <div className="flex items-center gap-3 text-sm text-muted dark:text-muted-dark mb-4">
                {data.featuredItem.year && <span>{data.featuredItem.year}</span>}
                {data.featuredItem.communityRating && (
                  <span className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-500 fill-yellow-500" />
                    {data.featuredItem.communityRating.toFixed(1)}
                  </span>
                )}
              </div>
              <Link
                to={`/media/${data.featuredItem.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium transition-colors"
              >
                <Play size={18} /> {t('media.play')}
              </Link>
            </div>
          </div>
        </section>
      )}

      <MediaRow title={t('home.continueWatching')} items={data.continueWatching} />
      <MediaRow title={t('home.recentlyAdded')} items={data.recentlyAdded} />
      <MediaRow title={t('home.recentlyWatched')} items={data.recentlyWatched} />
    </div>
  );
}
