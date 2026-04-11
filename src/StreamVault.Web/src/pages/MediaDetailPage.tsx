import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { api } from '../api/client';
import { Play, Star, Heart, Clock, List, ChevronDown, ChevronLeft, ChevronRight, FolderPlus, Info, Languages, Subtitles, MoreHorizontal } from 'lucide-react';
import type { TvShowDetailResponse, MediaListStatus, MediaFileResponse, AudioTrackInfo, SubtitleResponse, PersonResponse } from '../types';

const LANG_NAMES: Record<string, string> = {
  eng: 'English', deu: 'German', ger: 'German', fra: 'French', fre: 'French',
  spa: 'Spanish', ita: 'Italian', por: 'Portuguese', rus: 'Russian', jpn: 'Japanese',
  kor: 'Korean', zho: 'Chinese', chi: 'Chinese', hin: 'Hindi', ara: 'Arabic',
  tur: 'Turkish', pol: 'Polish', nld: 'Dutch', dut: 'Dutch', swe: 'Swedish',
  nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', ces: 'Czech', cze: 'Czech',
  hun: 'Hungarian', ron: 'Romanian', rum: 'Romanian', tha: 'Thai', vie: 'Vietnamese',
  und: 'Unknown',
};
function langName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] || code;
}

const LIST_STATUSES: { value: MediaListStatus; label: string }[] = [
  { value: 'Watching', label: 'Watching' },
  { value: 'Planned', label: 'Planned' },
  { value: 'Completed', label: 'Completed' },
  { value: 'OnHold', label: 'On Hold' },
  { value: 'Dropped', label: 'Dropped' },
];

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
  if (!media) return <div className="text-muted dark:text-muted-dark">Not found</div>;

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

  return (
    <div className="-mx-6 -mt-6" onClick={() => { setShowListMenu(false); setShowMoreMenu(false); }}>
      {/* Cinematic Hero — NO overflow-hidden so dropdowns render freely */}
      <div className="relative mb-0" style={{ minHeight: '520px' }}>
        {backdrop && (
          <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface dark:from-surface-dark via-transparent to-transparent" />

        <div className="relative flex gap-8 min-h-[520px] items-end px-10 pb-10">
          {poster && (
            <img src={poster} alt={media.title} className="w-52 rounded-xl shadow-2xl hidden sm:block" />
          )}
          <div className="flex-1 max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 drop-shadow-lg">{media.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-white/70 mb-4">
              {media.year && <span className="font-medium text-base">{media.year}</span>}
              {media.communityRating && (
                <span className="flex items-center gap-1 text-base">
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />
                  {media.communityRating.toFixed(1)}
                </span>
              )}
              {media.runtimeMinutes && (
                <span className="flex items-center gap-1 text-base">
                  <Clock size={16} /> {media.runtimeMinutes} {t('media.runtime')}
                </span>
              )}
              {selectedFile && formatQuality(selectedFile.resolution) && (
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-white/20 text-white backdrop-blur-sm">
                  {formatQuality(selectedFile.resolution)}
                </span>
              )}
            </div>
            {media.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {media.genres.map((g) => (
                  <span key={g} className="px-3 py-1 text-sm rounded-full bg-white/10 text-white/80 backdrop-blur-sm">{g}</span>
                ))}
              </div>
            )}
            {media.overview && (
              <p className="text-base text-white/60 mb-6 leading-relaxed line-clamp-4">{media.overview}</p>
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

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {selectedFile && (
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-2 px-8 py-3.5 bg-white hover:bg-white/90 text-black rounded-lg font-semibold transition-colors cursor-pointer text-base"
                >
                  <Play size={22} fill="currentColor" /> {t('media.play')}
                </button>
              )}
              <button
                onClick={() => watchlistToggle.mutate()}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-lg font-medium transition-colors cursor-pointer text-base ${
                  media.isInWatchlist
                    ? 'bg-danger/20 text-danger backdrop-blur-sm'
                    : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
                }`}
                title={media.isInWatchlist ? 'Remove from Watchlist' : 'Save to Watchlist'}
              >
                <Heart size={20} className={media.isInWatchlist ? 'fill-danger' : ''} />
                {media.isInWatchlist ? 'Saved' : 'Watchlist'}
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
                  {listEntry ? listEntry.status : 'Add to List'}
                  <ChevronDown size={14} />
                </button>
                {showListMenu && (
                  <div className="absolute bottom-full mb-2 left-0 z-50 w-52 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark shadow-2xl py-1.5">
                    {LIST_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => listMutation.mutate(s.value)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-border dark:hover:bg-border-dark transition-colors cursor-pointer ${
                          listEntry?.status === s.value ? 'text-primary font-medium' : 'text-text dark:text-text-dark'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                    {listEntry && (
                      <>
                        <div className="border-t border-border dark:border-border-dark my-1" />
                        <button
                          onClick={() => removeListMutation.mutate()}
                          className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        >
                          Remove from List
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
                    {LIST_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => listMutation.mutate(s.value)}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-border dark:hover:bg-border-dark transition-colors cursor-pointer flex items-center gap-2 ${
                          listEntry?.status === s.value ? 'text-primary font-medium' : 'text-text dark:text-text-dark'
                        }`}
                      >
                        <List size={16} /> Mark as {s.label}
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
  return (
    <section className="mb-8 flex flex-wrap gap-6">
      {audioTracks.length > 1 && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark mb-2">
            <Languages size={16} /> Audio Track
          </label>
          <select
            value={selectedAudio ?? ''}
            onChange={(e) => onAudioChange(e.target.value ? Number(e.target.value) : undefined)}
            className="px-4 py-2.5 rounded-lg text-sm bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark focus:ring-2 focus:ring-primary outline-none min-w-[200px]"
          >
            <option value="">Default</option>
            {audioTracks.map((t) => {
              const lang = langName(t.language);
              const chLabel = t.channels === 6 ? '5.1' : t.channels === 8 ? '7.1' : `${t.channels}ch`;
              return (
                <option key={t.streamIndex} value={t.streamIndex}>
                  {t.title || lang} — {t.codec} · {chLabel}
                </option>
              );
            })}
          </select>
        </div>
      )}
      {subtitles.length > 0 && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-text dark:text-text-dark mb-2">
            <Subtitles size={16} /> Subtitles
          </label>
          <select
            value={selectedSubtitle ?? ''}
            onChange={(e) => onSubtitleChange(e.target.value || undefined)}
            className="px-4 py-2.5 rounded-lg text-sm bg-surface-secondary dark:bg-surface-secondary-dark text-text dark:text-text-dark border border-border dark:border-border-dark focus:ring-2 focus:ring-primary outline-none min-w-[200px]"
          >
            <option value="">Off</option>
            {subtitles.map((s) => (
              <option key={s.id} value={s.id}>
                {langName(s.language)}{s.isForced ? ' (Forced)' : ''} — {s.format}
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
        Technical Details
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
                  {season.name || `Season ${season.seasonNumber}`} ({season.episodes.length} eps{watchedCount > 0 ? `, ${watchedCount} watched` : ''})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {selectedSeason && (
        <div className="rounded-xl border border-border dark:border-border-dark overflow-hidden">
          <div className="divide-y divide-border dark:divide-border-dark max-h-[600px] overflow-y-auto">
            {selectedSeason.episodes.map((ep) => {
              const mf = pickFile(ep.mediaFiles);
              const progressPct = ep.progress && ep.progress.durationSeconds
                ? Math.round((ep.progress.positionTicks / (ep.progress.durationSeconds * 10_000_000)) * 100)
                : null;

              return (
                <div
                  key={ep.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary/50 dark:hover:bg-surface-secondary-dark/50 cursor-pointer transition-colors"
                  onClick={() => mf && navigate(`/player/${mf.id}${ep.progress ? `?t=${ep.progress.positionTicks}` : ''}`)}
                >
                  <span className="text-base font-medium text-muted dark:text-muted-dark w-8 text-center shrink-0">
                    {ep.episodeNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text dark:text-text-dark truncate">{ep.title}</div>
                    <div className="flex items-center gap-2">
                      {ep.runtimeMinutes && <span className="text-xs text-muted dark:text-muted-dark">{ep.runtimeMinutes} min</span>}
                      {ep.overview && <span className="text-xs text-muted dark:text-muted-dark truncate hidden sm:inline">{ep.overview}</span>}
                    </div>
                    {progressPct !== null && progressPct < 100 && (
                      <div className="mt-1.5 h-1 rounded-full bg-border dark:bg-border-dark">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} />
                      </div>
                    )}
                  </div>
                  {mf && (
                    <button className="px-3 py-2 bg-primary hover:bg-primary-hover text-white text-sm rounded-lg shrink-0">
                      <Play size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
