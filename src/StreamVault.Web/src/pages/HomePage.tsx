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

          <div className="relative flex items-end min-h-[480px] 2xl:min-h-[600px] px-10 2xl:px-16 pb-12 2xl:pb-16">
            <div className="max-w-xl 2xl:max-w-2xl">
              <h1 className="text-4xl lg:text-5xl 2xl:text-6xl font-bold text-white mb-3 2xl:mb-5 drop-shadow-lg">{heroItem.title}</h1>
              <div className="flex items-center gap-3 text-sm 2xl:text-lg text-white/70 mb-4 2xl:mb-6">
                {heroItem.year && <span className="font-medium">{heroItem.year}</span>}
                {heroItem.communityRating && (
                  <span className="flex items-center gap-1">
                    <Star size={14} className="text-yellow-400 fill-yellow-400 2xl:!w-5 2xl:!h-5" />
                    {heroItem.communityRating.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 2xl:gap-4">
                <Link
                  to={`/media/${heroItem.id}`}
                  className="inline-flex items-center gap-2 px-6 py-3 2xl:px-10 2xl:py-4 bg-white hover:bg-white/90 text-black rounded-lg font-semibold transition-colors text-base 2xl:text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <Play size={20} fill="currentColor" className="2xl:!w-7 2xl:!h-7" /> {t('media.play')}
                </Link>
                <Link
                  to={`/media/${heroItem.id}`}
                  className="inline-flex items-center gap-2 px-6 py-3 2xl:px-10 2xl:py-4 bg-white/20 hover:bg-white/30 text-white rounded-lg font-semibold transition-colors text-base 2xl:text-xl backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Info size={20} className="2xl:!w-7 2xl:!h-7" /> {t('media.details', 'More Info')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="px-6 2xl:px-10 space-y-2 2xl:space-y-4">
        <MediaRow title={t('home.continueWatching')} items={data.continueWatching} showEpisodeInfo />
        <MediaRow title={t('home.recentlyAdded')} items={data.recentlyAdded} />
        <MediaRow title={t('home.recentlyWatched')} items={data.recentlyWatched} />
      </div>
    </div>
  );
}
