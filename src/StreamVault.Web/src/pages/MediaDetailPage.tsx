import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Play, Star, Heart, Clock } from 'lucide-react';
import type { MediaItemResponse, TvShowDetailResponse } from '../types';

export default function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: media, isLoading } = useQuery({
    queryKey: ['media', id],
    queryFn: () => api.media.get(id!),
    enabled: !!id,
  });

  const { data: tvData } = useQuery({
    queryKey: ['media-tv', id],
    queryFn: () => api.media.tvshow(id!),
    enabled: !!id && media?.mediaType === 'TvShow',
  });

  const watchlistToggle = useMutation({
    mutationFn: () => media?.isInWatchlist
      ? api.watchlist.remove(id!)
      : api.watchlist.add(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media', id] }),
  });

  if (isLoading) return <div className="text-muted dark:text-muted-dark">Loading...</div>;
  if (!media) return <div className="text-muted dark:text-muted-dark">Not found</div>;

  const backdrop = media.images.find((i) => i.type === 'Backdrop')?.url;
  const poster = media.images.find((i) => i.type === 'Poster')?.url;
  const firstFile = media.mediaFiles[0];

  const handlePlay = () => {
    if (firstFile) navigate(`/player/${firstFile.id}`);
  };

  return (
    <div>
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-8 bg-surface-secondary dark:bg-surface-secondary-dark">
        {backdrop && (
          <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="relative p-8 flex gap-6 min-h-[400px] items-end">
          {poster && (
            <img src={poster} alt={media.title} className="w-48 rounded-xl shadow-lg hidden sm:block" />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text dark:text-text-dark mb-2">{media.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted dark:text-muted-dark mb-3">
              {media.year && <span>{media.year}</span>}
              {media.communityRating && (
                <span className="flex items-center gap-1">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  {media.communityRating.toFixed(1)}
                </span>
              )}
              {media.runtimeMinutes && (
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {media.runtimeMinutes} {t('media.runtime')}
                </span>
              )}
            </div>
            {media.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {media.genres.map((g) => (
                  <span key={g} className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">{g}</span>
                ))}
              </div>
            )}
            {media.overview && (
              <p className="text-sm text-muted dark:text-muted-dark mb-4 max-w-2xl leading-relaxed">{media.overview}</p>
            )}
            <div className="flex gap-3">
              {firstFile && (
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium transition-colors"
                >
                  <Play size={18} /> {t('media.play')}
                </button>
              )}
              <button
                onClick={() => watchlistToggle.mutate()}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors border ${
                  media.isInWatchlist
                    ? 'bg-danger/10 border-danger text-danger'
                    : 'border-border dark:border-border-dark text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                }`}
              >
                <Heart size={18} className={media.isInWatchlist ? 'fill-danger' : ''} />
                {media.isInWatchlist ? t('media.removeFromWatchlist') : t('media.addToWatchlist')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TV Show Seasons */}
      {tvData && <TvShowSeasons data={tvData} />}

      {/* Cast */}
      {media.cast.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">{t('media.cast')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {media.cast.filter((p) => p.role === 'Actor').slice(0, 12).map((person) => (
              <div key={`${person.id}-${person.character}`} className="p-3 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
                <div className="font-medium text-sm text-text dark:text-text-dark">{person.name}</div>
                {person.character && <div className="text-xs text-muted dark:text-muted-dark">{person.character}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Media Files */}
      {media.mediaFiles.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">Files</h2>
          <div className="space-y-2">
            {media.mediaFiles.map((mf) => (
              <div key={mf.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">
                <div className="text-sm text-text dark:text-text-dark">
                  <span className="font-medium">{mf.container.toUpperCase()}</span>
                  {mf.resolution && <span className="text-muted dark:text-muted-dark ml-2">{mf.resolution}</span>}
                  {mf.videoCodec && <span className="text-muted dark:text-muted-dark ml-2">{mf.videoCodec}</span>}
                </div>
                <button
                  onClick={() => navigate(`/player/${mf.id}`)}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-sm rounded-lg"
                >
                  <Play size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TvShowSeasons({ data }: { data: TvShowDetailResponse }) {
  const navigate = useNavigate();

  return (
    <section className="mb-8">
      {data.seasons.map((season) => (
        <div key={season.id} className="mb-6">
          <h3 className="text-md font-semibold mb-3 text-text dark:text-text-dark">
            {season.name || `Season ${season.seasonNumber}`}
          </h3>
          <div className="space-y-2">
            {season.episodes.map((ep) => {
              const mf = ep.mediaFiles[0];
              const progressPct = ep.progress && ep.progress.durationSeconds
                ? Math.round((ep.progress.positionTicks / (ep.progress.durationSeconds * 10_000_000)) * 100)
                : null;

              return (
                <div
                  key={ep.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                  onClick={() => mf && navigate(`/player/${mf.id}`)}
                >
                  <span className="text-sm font-medium text-muted dark:text-muted-dark w-8 text-center">
                    {ep.episodeNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text dark:text-text-dark truncate">{ep.title}</div>
                    {ep.runtimeMinutes && (
                      <span className="text-xs text-muted dark:text-muted-dark">{ep.runtimeMinutes} min</span>
                    )}
                    {progressPct !== null && progressPct < 100 && (
                      <div className="mt-1 h-1 rounded-full bg-border dark:bg-border-dark">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} />
                      </div>
                    )}
                  </div>
                  {mf && (
                    <button className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-sm rounded-lg shrink-0">
                      <Play size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
