import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { api } from '../api/client';
import { Play, Star, Heart, Clock, List, ChevronDown, ChevronLeft, ChevronRight, FolderPlus, Info, Languages, Subtitles, MoreHorizontal } from 'lucide-react';
import type { TvShowDetailResponse, MediaListStatus, MediaFileResponse, AudioTrackInfo, SubtitleResponse, PersonResponse } from '../types';
import i18n from '../i18n';

function langName(code: string): string {
  const key = `lang.${code.toLowerCase()}`;
  const result = i18n.t(key);
  return result === key ? code : result;
}

const LIST_STATUS_VALUES: MediaListStatus[] = ['Watching', 'Planned', 'Completed', 'OnHold', 'Dropped'];

export default function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showListMenu, setShowListMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(undefined);
  const [selectedAudio, setSelectedAudio] = useState<number | undefined>(undefined);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | undefined>(undefined);

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

  const { data: listEntry } = useQuery({
    queryKey: ['list-entry', id],
    queryFn: () => api.lists.get(id!).catch(() => null),
    enabled: !!id,
  });

  const watchlistToggle = useMutation({
    mutationFn: () => media?.isInWatchlist
      ? api.watchlist.remove(id!)
      : api.watchlist.add(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media', id] }),
  });

  const listMutation = useMutation({
    mutationFn: (status: MediaListStatus) => api.lists.upsert(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list-entry', id] });
      queryClient.invalidateQueries({ queryKey: ['user-lists'] });
      setShowListMenu(false);
      setShowMoreMenu(false);
    },
  });

  const removeListMutation = useMutation({
    mutationFn: () => api.lists.remove(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list-entry', id] });
      queryClient.invalidateQueries({ queryKey: ['user-lists'] });
    },
  });

  const { data: mediaCollections } = useQuery({
    queryKey: ['media-collections', id],
    queryFn: () => api.collections.forMedia(id!),
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="-mx-6 -mt-6 animate-pulse">
      <div className="h-[520px] bg-surface-secondary dark:bg-surface-secondary-dark" />
      <div className="px-8 pt-6 space-y-4">
        <div className="h-6 w-48 rounded bg-surface-secondary dark:bg-surface-secondary-dark" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark" />
          ))}
        </div>
      </div>
    </div>
  );
  if (!media) return <div className="text-muted dark:text-muted-dark">{t('media.notFound')}</div>;

  const backdrop = media.images.find((i) => i.type === 'Backdrop')?.url;
  const poster = media.images.find((i) => i.type === 'Poster')?.url;
  const hasMultipleFiles = media.mediaFiles.length > 1;
  const selectedFile = (selectedFileId
    ? media.mediaFiles.find(f => f.id === selectedFileId)
    : media.mediaFiles[0]) ?? media.mediaFiles[0];
  const audioTracks = selectedFile?.audioTracks ?? [];
  const subtitles = selectedFile?.subtitles ?? [];

  const handlePlay = () => {
    if (!selectedFile) return;
    const params = new URLSearchParams();
    if (selectedAudio !== undefined) params.set('audio', String(selectedAudio));
    if (selectedSubtitle) params.set('sub', selectedSubtitle);
    const qs = params.toString();
    navigate(`/player/${selectedFile.id}${qs ? `?${qs}` : ''}`);
  };

  // Match homepage Continue Watching: resume the latest watched in-progress episode.
  const inProgressEpisode = (() => {
    if (media.mediaType !== 'TvShow' || !tvData) return null;
    let latest: {
      season: TvShowDetailResponse['seasons'][number];
      episode: TvShowDetailResponse['seasons'][number]['episodes'][number];
    } | null = null;
    for (const season of tvData.seasons) {
      for (const ep of season.episodes) {
        if (ep.progress && !ep.progress.completed && ep.progress.positionTicks > 0) {
          if (
            !latest ||
            new Date(ep.progress.lastWatchedAt).getTime() >
              new Date(latest.episode.progress!.lastWatchedAt).getTime()
          ) {
            latest = { season, episode: ep };
          }
        }
      }
    }
    return latest;
  })();

  const resumePct = inProgressEpisode?.episode.progress?.durationSeconds
    ? Math.round(
        (inProgressEpisode.episode.progress!.positionTicks /
          (inProgressEpisode.episode.progress!.durationSeconds * 10_000_000)) * 100
      )
    : null;

  const handleSmartPlay = () => {
    if (media.mediaType !== 'TvShow' || !tvData) {
      handlePlay();
      return;
    }
    if (inProgressEpisode) {
      const progress = inProgressEpisode.episode.progress!;
      navigate(`/player/${progress.mediaFileId}?t=${progress.positionTicks}`);
      return;
    }
    // No in-progress episode — find the first unwatched
    for (const season of tvData.seasons) {
      for (const ep of season.episodes) {
        if (!ep.progress?.completed) {
          const mf = ep.mediaFiles[0];
          if (mf) {
            navigate(`/player/${mf.id}`);
            return;
          }
        }
      }
    }
    // All watched — play first episode
    const firstEp = tvData.seasons[0]?.episodes[0];
    const firstFile = firstEp?.mediaFiles[0];
    if (firstFile) navigate(`/player/${firstFile.id}`);
  };

  const playLabel: string = (() => {
    if (media.mediaType !== 'TvShow' || !tvData) return t('media.play');
    if (inProgressEpisode) return t('media.resume', 'Resume');
    return t('media.play');
  })();

  return (
    <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6" onClick={() => { setShowListMenu(false); setShowMoreMenu(false); }}>
      {/* Cinematic Hero — NO overflow-hidden so dropdowns render freely */}
      <div className="relative mb-0 min-h-[320px] sm:min-h-[420px] lg:min-h-[520px]">
        {backdrop && (
          <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface dark:from-surface-dark via-transparent to-transparent" />

        <div className="relative flex gap-4 sm:gap-6 lg:gap-8 2xl:gap-12 min-h-[320px] sm:min-h-[420px] lg:min-h-[520px] 2xl:min-h-[640px] items-end px-4 sm:px-6 lg:px-10 2xl:px-16 pb-6 sm:pb-8 lg:pb-10 2xl:pb-14">
          {poster && (
            <img src={poster} alt={media.title} className="w-52 2xl:w-72 rounded-xl shadow-2xl hidden sm:block" />
          )}
          <div className="flex-1 max-w-3xl 2xl:max-w-4xl">
            <h1 className="text-4xl lg:text-5xl 2xl:text-6xl font-bold text-white mb-3 2xl:mb-5 drop-shadow-lg">{media.title}</h1>
            <div className="flex flex-wrap items-center gap-3 2xl:gap-4 text-white/70 mb-4 2xl:mb-6">
              {media.year && <span className="font-medium text-base 2xl:text-lg">{media.year}</span>}
              {media.communityRating && (
                <span className="flex items-center gap-1 text-base 2xl:text-lg">
                  <Star size={16} className="text-yellow-400 fill-yellow-400 2xl:!w-5 2xl:!h-5" />
                  {media.communityRating.toFixed(1)}
                </span>
              )}
              {media.runtimeMinutes && (
                <span className="flex items-center gap-1 text-base 2xl:text-lg">
                  <Clock size={16} className="2xl:!w-5 2xl:!h-5" /> {media.runtimeMinutes} {t('media.runtime')}
                </span>
              )}
              {selectedFile && formatQuality(selectedFile.resolution) && (
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-white/20 text-white backdrop-blur-sm">
                  {formatQuality(selectedFile.resolution)}
                </span>
              )}
            </div>
            {media.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 2xl:gap-3 mb-4 2xl:mb-6">
                {media.genres.map((g) => (
                  <span key={g} className="px-3 py-1 2xl:px-4 2xl:py-1.5 text-sm 2xl:text-base rounded-full bg-white/10 text-white/80 backdrop-blur-sm">{g}</span>
                ))}
              </div>
            )}
            {media.overview && (
              <p className="text-base 2xl:text-lg text-white/60 mb-6 2xl:mb-8 leading-relaxed line-clamp-4">{media.overview}</p>
            )}

            {/* Language version chips — shown when multiple files exist */}
            {hasMultipleFiles && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Languages size={16} className="text-white/50" />
                {media.mediaFiles.map((mf) => {
                  const isActive = mf.id === selectedFile?.id;
                  const label = mf.audioTracks.length > 0
                    ? mf.audioTracks.map(t => langName(t.language)).filter((v, i, a) => a.indexOf(v) === i).join(' + ')
                    : mf.s3Key.split('/').pop() ?? 'Unknown';
                  return (
                    <button
                      key={mf.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedFileId(mf.id); setSelectedAudio(undefined); setSelectedSubtitle(undefined); }}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'bg-white/15 text-white/70 hover:bg-white/25 backdrop-blur-sm'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Continue-watching chip — separate, prominent surface above the
                play button so the user sees what they'll resume into and a
                progress bar, rather than having that info squished into the
                button label. */}
            {inProgressEpisode && (
              <div className="mb-3 inline-flex flex-col gap-1.5 px-4 py-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 max-w-md">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60 font-semibold">
                  {t('media.continueWatching', 'Continue Watching')}
                </div>
                <div className="text-white text-sm font-medium truncate">
                  S{inProgressEpisode.season.seasonNumber}E{inProgressEpisode.episode.episodeNumber} — {inProgressEpisode.episode.title}
                </div>
                {resumePct !== null && (
                  <div className="h-1 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${resumePct}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 2xl:gap-4">
              {(selectedFile || media.mediaType === 'TvShow') && (
                <button
                  onClick={handleSmartPlay}
                  className="flex items-center gap-2 px-8 py-3.5 2xl:px-10 2xl:py-4 bg-white hover:bg-white/90 text-black rounded-lg font-semibold transition-colors cursor-pointer text-base 2xl:text-xl"
                >
                  <Play size={22} fill="currentColor" /> {playLabel}
                </button>
              )}
              <button
                onClick={() => watchlistToggle.mutate()}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-lg font-medium transition-colors cursor-pointer text-base ${
                  media.isInWatchlist
                    ? 'bg-danger/20 text-danger backdrop-blur-sm'
                    : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                }`}
                title={media.isInWatchlist ? t('media.removeFromWatchlist') : t('media.addToWatchlist')}
              >
                <Heart size={20} className={media.isInWatchlist ? 'fill-danger' : ''} />
                {media.isInWatchlist ? t('media.saved') : t('media.watchlist')}
              </button>

              {/* List status dropdown — opens upward to avoid clipping */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setShowListMenu(!showListMenu); setShowMoreMenu(false); }}
                  className={`flex items-center gap-2 px-5 py-3.5 rounded-lg font-medium transition-colors cursor-pointer text-base ${
                    listEntry
                      ? 'bg-primary/20 text-primary backdrop-blur-sm'
                      : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                  }`}
                >
                  <List size={20} />
                  {listEntry ? t(`listStatus.${listEntry.status}`) : t('media.addToList')}
                  <ChevronDown size={14} />
                </button>
                {showListMenu && (
                  <div className="absolute bottom-full mb-2 left-0 z-50 w-52 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark shadow-2xl py-1.5">
                    {LIST_STATUS_VALUES.map((s) => (
                      <button
                        key={s}
                        onClick={() => listMutation.mutate(s)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-border dark:hover:bg-border-dark transition-colors cursor-pointer ${
                          listEntry?.status === s ? 'text-primary font-medium' : 'text-text dark:text-text-dark'
                        }`}
                      >
                        {t(`listStatus.${s}`)}
                      </button>
                    ))}
                    {listEntry && (
                      <>
                        <div className="border-t border-border dark:border-border-dark my-1" />
                        <button
                          onClick={() => removeListMutation.mutate()}
                          className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        >
                          {t('media.removeFromList')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* More options (3-dot) menu */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setShowMoreMenu(!showMoreMenu); setShowListMenu(false); }}
                  className="flex items-center gap-2 p-3.5 rounded-lg font-medium transition-colors cursor-pointer bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
                  title="More options"
                >
                  <MoreHorizontal size={20} />
                </button>
                {showMoreMenu && (
                  <div className="absolute bottom-full mb-2 right-0 z-50 w-56 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark shadow-2xl py-1.5">
                    {mediaCollections && mediaCollections.length > 0 && (
                      <button
                        onClick={() => navigate(`/collections/${mediaCollections[0].id}`)}
                        className="w-full text-left px-4 py-2.5 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <FolderPlus size={16} /> {mediaCollections[0].name}
                      </button>
                    )}
                    {LIST_STATUS_VALUES.map((s) => (
                      <button
                        key={s}
                        onClick={() => listMutation.mutate(s)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-border dark:hover:bg-border-dark transition-colors cursor-pointer flex items-center gap-2 ${
                          listEntry?.status === s ? 'text-primary font-medium' : 'text-text dark:text-text-dark'
                        }`}
                      >
                        <List size={16} /> {t('media.markAs')} {t(`listStatus.${s}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8">

      {/* Audio & Subtitle Preselect */}
      {selectedFile && (audioTracks.length > 1 || subtitles.length > 0) && (
        <AudioSubtitleSelector
          audioTracks={audioTracks}
          subtitles={subtitles}
          selectedAudio={selectedAudio}
          selectedSubtitle={selectedSubtitle}
          onAudioChange={setSelectedAudio}
          onSubtitleChange={setSelectedSubtitle}
        />
      )}

      {/* TV Show Seasons */}
      {tvData && <TvShowSeasons data={tvData} />}

      {/* Cast carousel */}
      {media.cast.length > 0 && (
        <CastCarousel cast={media.cast.filter((p) => p.role === 'Actor').slice(0, 20)} />
      )}

      {/* Media Info (for movies - human-friendly quality display) */}
      {media.mediaType === 'Movie' && media.mediaFiles.length > 0 && <MovieFileInfo file={selectedFile} />}
      </div>
    </div>
  );
}

/* ========== Audio & Subtitle Preselect ========== */

function AudioSubtitleSelector({ audioTracks, subtitles, selectedAudio, selectedSubtitle, onAudioChange, onSubtitleChange }: {
  audioTracks: AudioTrackInfo[];
  subtitles: SubtitleResponse[];
  selectedAudio: number | undefined;
  selectedSubtitle: string | undefined;
  onAudioChange: (v: number | undefined) => void;
  onSubtitleChange: (v: string | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="mb-8 flex flex-wrap gap-6">
      {audioTracks.length > 1 && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark mb-2">
            <Languages size={16} /> {t('media.audioTrack')}
          </label>
          <select
            value={selectedAudio ?? ''}
            onChange={(e) => onAudioChange(e.target.value ? Number(e.target.value) : undefined)}
            className="px-4 py-2.5 rounded-lg text-sm bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark focus:ring-2 focus:ring-primary outline-none min-w-[200px]"
          >
            <option value="">{t('media.default')}</option>
            {audioTracks.map((track) => {
              const lang = langName(track.language);
              const chLabel = track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : `${track.channels}ch`;
              return (
                <option key={track.streamIndex} value={track.streamIndex}>
                  {track.title || lang} — {track.codec} · {chLabel}
                </option>
              );
            })}
          </select>
        </div>
      )}
      {subtitles.length > 0 && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark mb-2">
            <Subtitles size={16} /> {t('media.subtitles')}
          </label>
          <select
            value={selectedSubtitle ?? ''}
            onChange={(e) => onSubtitleChange(e.target.value || undefined)}
            className="px-4 py-2.5 rounded-lg text-sm bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark focus:ring-2 focus:ring-primary outline-none min-w-[200px]"
          >
            <option value="">{t('media.off')}</option>
            {subtitles.map((s) => (
              <option key={s.id} value={s.id}>
                {langName(s.language)}{s.isForced ? ` (${i18n.t('media.forced')})` : ''} — {s.format}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}

/* ========== Cast Carousel ========== */

function CastCarousel({ cast }: { cast: PersonResponse[] }) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className="mb-8 group/cast relative">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">{t('media.cast')}</h2>
      <div className="relative">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center bg-gradient-to-r from-surface dark:from-surface-dark to-transparent opacity-0 group-hover/cast:opacity-100 transition-opacity"
        >
          <ChevronLeft size={24} className="text-text dark:text-text-dark" />
        </button>
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {cast.map((person) => (
            <div key={`${person.id}-${person.character}`} className="shrink-0 w-32 text-center">
              <div className="w-24 h-24 mx-auto rounded-full overflow-hidden bg-surface-secondary dark:bg-surface-secondary-dark border-2 border-border dark:border-border-dark mb-2">
                {person.imageUrl ? (
                  <img src={person.imageUrl} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted dark:text-muted-dark text-2xl font-bold">
                    {person.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="font-medium text-sm text-text dark:text-text-dark truncate">{person.name}</div>
              {person.character && <div className="text-xs text-muted dark:text-muted-dark truncate">{person.character}</div>}
            </div>
          ))}
        </div>
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 flex items-center justify-center bg-gradient-to-l from-surface dark:from-surface-dark to-transparent opacity-0 group-hover/cast:opacity-100 transition-opacity"
        >
          <ChevronRight size={24} className="text-text dark:text-text-dark" />
        </button>
      </div>
    </section>
  );
}

/* ========== Helpers ========== */

function formatQuality(resolution: string | null): string | null {
  if (!resolution) return null;
  const match = resolution.match(/(\d+)x(\d+)/);
  if (!match) return resolution;
  const height = parseInt(match[2], 10);
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  return `${height}p`;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MovieFileInfo({ file }: { file: MediaFileResponse }) {
  const { t } = useTranslation();
  const [showTechnical, setShowTechnical] = useState(false);
  const quality = formatQuality(file.resolution);
  const duration = formatDuration(file.durationSeconds);

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {quality && <span className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-semibold">{quality}</span>}
        {duration && (
          <span className="flex items-center gap-1.5 text-sm text-muted dark:text-muted-dark">
            <Clock size={14} /> {duration}
          </span>
        )}
      </div>
      <button
        onClick={() => setShowTechnical(!showTechnical)}
        className="flex items-center gap-1.5 text-xs text-muted dark:text-muted-dark hover:text-text dark:hover:text-text-dark transition-colors"
      >
        <Info size={14} />
        {t('media.technicalDetails')}
        <ChevronDown size={12} className={`transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
      </button>
      {showTechnical && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted dark:text-muted-dark">
          {file.resolution && <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">{file.resolution}</span>}
          {file.videoCodec && <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">Video: {file.videoCodec}</span>}
          {file.audioCodec && <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">Audio: {file.audioCodec}</span>}
          {file.container && <span className="px-2 py-1 rounded bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark">{file.container.toUpperCase()}</span>}
        </div>
      )}
    </section>
  );
}

/* ========== TV Show Seasons ========== */

function TvShowSeasons({ data }: { data: TvShowDetailResponse }) {
  const navigate = useNavigate();
  const MAX_TABS = 6;

  const defaultSeason = data.seasons.find(s =>
    s.episodes.some(ep => ep.progress && !ep.progress.completed)
  ) ?? data.seasons[0];
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(defaultSeason?.id ?? '');
  const [preferredLang, setPreferredLang] = useState<string | undefined>(undefined);

  const selectedSeason = data.seasons.find(s => s.id === selectedSeasonId);
  const useTabs = data.seasons.length <= MAX_TABS;

  // Collect all unique languages across all episodes' audio tracks
  const allLangs = new Map<string, string>();
  for (const season of data.seasons) {
    for (const ep of season.episodes) {
      for (const mf of ep.mediaFiles) {
        for (const t of mf.audioTracks) {
          if (!allLangs.has(t.language)) {
            allLangs.set(t.language, langName(t.language));
          }
        }
      }
    }
  }
  const hasMultipleFiles = data.seasons.some(s => s.episodes.some(ep => ep.mediaFiles.length > 1));

  // Helper to pick the best file for an episode based on preferred language
  const pickFile = (files: MediaFileResponse[]) => {
    if (!preferredLang || files.length <= 1) return files[0];
    return files.find(f => f.audioTracks.some(t => t.language === preferredLang)) ?? files[0];
  };

  return (
    <section className="mb-8">
      {/* Language version selector for TV shows with multi-language files */}
      {hasMultipleFiles && allLangs.size > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Languages size={16} className="text-muted dark:text-muted-dark" />
          {[...allLangs.entries()].map(([code, name]) => (
            <button
              key={code}
              onClick={() => setPreferredLang(code === preferredLang ? undefined : code)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                code === preferredLang
                  ? 'bg-primary text-white'
                  : 'bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {useTabs ? (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {data.seasons.map((season) => {
            const isActive = season.id === selectedSeasonId;
            const watchedCount = season.episodes.filter(ep => ep.progress?.completed).length;
            return (
              <button
                key={season.id}
                onClick={() => setSelectedSeasonId(season.id)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark'
                }`}
              >
                {season.name || `S${season.seasonNumber}`}
                {watchedCount > 0 && (
                  <span className={`ml-1.5 text-xs ${isActive ? 'text-white/70' : 'text-primary'}`}>
                    {watchedCount}/{season.episodes.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <select
            value={selectedSeasonId}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark focus:ring-2 focus:ring-primary outline-none"
          >
            {data.seasons.map((season) => {
              const watchedCount = season.episodes.filter(ep => ep.progress?.completed).length;
              return (
                <option key={season.id} value={season.id}>
                  {season.name || `${i18n.t('media.season')} ${season.seasonNumber}`} ({season.episodes.length} {i18n.t('media.episodes')}{watchedCount > 0 ? `, ${watchedCount} ${i18n.t('media.watched')}` : ''})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {selectedSeason && (
        <div className="space-y-3">
          {selectedSeason.episodes.map((ep) => {
            const mf = pickFile(ep.mediaFiles);
            const progressPct = ep.progress && ep.progress.durationSeconds
              ? Math.round((ep.progress.positionTicks / (ep.progress.durationSeconds * 10_000_000)) * 100)
              : null;
            const isCompleted = ep.progress?.completed;
            const playMediaFileId = ep.progress && !ep.progress.completed ? ep.progress.mediaFileId : mf?.id;
            const playUrl = playMediaFileId
              ? `/player/${playMediaFileId}${ep.progress && !ep.progress.completed ? `?t=${ep.progress.positionTicks}` : ''}`
              : null;

            return (
              <div
                key={ep.id}
                role="button"
                tabIndex={0}
                className="group flex flex-col sm:flex-row gap-4 p-3 rounded-xl hover:bg-surface-secondary/60 dark:hover:bg-surface-secondary-dark/60 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => { if (playUrl) navigate(playUrl); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && playUrl) navigate(playUrl); }}
              >
                {/* Thumbnail (16:9, Netflix-style) */}
                <div className="relative shrink-0 w-full sm:w-64 aspect-video rounded-lg overflow-hidden bg-surface-secondary dark:bg-surface-secondary-dark">
                  {ep.stillUrl ? (
                    <img
                      src={ep.stillUrl}
                      alt={ep.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted dark:text-muted-dark text-3xl font-bold">
                      {ep.episodeNumber}
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={20} fill="currentColor" />
                    </div>
                  </div>
                  {/* Progress bar at bottom */}
                  {progressPct !== null && progressPct > 0 && progressPct < 100 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                      <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                    </div>
                  )}
                  {isCompleted && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-black/70 text-white">
                      ✓
                    </div>
                  )}
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-muted dark:text-muted-dark">
                      {ep.episodeNumber}
                    </span>
                    <h3 className="text-base font-semibold text-text dark:text-text-dark truncate">
                      {ep.title}
                    </h3>
                    {ep.runtimeMinutes && (
                      <span className="text-xs text-muted dark:text-muted-dark shrink-0">
                        · {ep.runtimeMinutes}m
                      </span>
                    )}
                  </div>
                  {ep.overview && (
                    <p className="text-sm text-muted dark:text-muted-dark line-clamp-2">
                      {ep.overview}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
