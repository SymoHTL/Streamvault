import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MediaRow from '../components/MediaRow';
import { Link } from 'react-router-dom';
import { Play, Star, Info } from 'lucide-react';

export default function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: api.home });

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-[420px] rounded-2xl bg-surface-secondary dark:bg-surface-secondary-dark" />
        <div className="h-6 w-48 rounded bg-surface-secondary dark:bg-surface-secondary-dark" />
        <div className="flex gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-[200px] aspect-[2/3] rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark shrink-0" />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const heroItem = data.featuredItem;
  const heroBackdrop = heroItem?.posterPath;

  return (
    <div className="-mx-6 -mt-6">
      {/* Cinematic Hero */}
      {heroItem && (
        <section className="relative mb-8 overflow-hidden" style={{ minHeight: '480px' }}>
          {heroBackdrop && (
            <img
              src={heroBackdrop}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Dark gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface dark:from-surface-dark via-transparent to-transparent" />

          <div className="relative flex items-end min-h-[480px] px-10 pb-12">
            <div className="max-w-xl">
              <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 drop-shadow-lg">{heroItem.title}</h1>
              <div className="flex items-center gap-3 text-sm text-white/70 mb-4">
                {heroItem.year && <span className="font-medium">{heroItem.year}</span>}
                {heroItem.communityRating && (
                  <span className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    {heroItem.communityRating.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to={`/media/${heroItem.id}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-white/90 text-black rounded-lg font-semibold transition-colors text-base"
                >
                  <Play size={20} fill="currentColor" /> {t('media.play')}
                </Link>
                <Link
                  to={`/media/${heroItem.id}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg font-semibold transition-colors text-base backdrop-blur-sm"
                >
                  <Info size={20} /> {t('media.details', 'More Info')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="px-6 space-y-2">
        <MediaRow title={t('home.continueWatching')} items={data.continueWatching} showEpisodeInfo />
        <MediaRow title={t('home.recentlyAdded')} items={data.recentlyAdded} />
        <MediaRow title={t('home.recentlyWatched')} items={data.recentlyWatched} />
      </div>
    </div>
  );
}
