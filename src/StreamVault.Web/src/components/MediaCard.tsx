import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MediaItemSummaryResponse, MediaListStatus } from '../types';
import { Play, Check, Clock, MoreVertical, List, FolderPlus } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  item: MediaItemSummaryResponse;
  showEpisodeInfo?: boolean;
}

export default function MediaCard({ item, showEpisodeInfo }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);

  const progressPercent = item.progress && item.progress.durationSeconds
    ? Math.round((item.progress.positionTicks / (item.progress.durationSeconds * 10_000_000)) * 100)
    : null;

  const ep = item.episodeInfo;
  const hasEpisode = showEpisodeInfo && ep && ep.seasonNumber > 0;

  // All cards link to the media overview for consistency
  const linkTo = `/media/${item.id}`;
  const directPlayFileId = showEpisodeInfo ? (item.progress?.mediaFileId ?? ep?.mediaFileId) : null;
  const playTo = directPlayFileId
    ? `/player/${directPlayFileId}${item.progress && item.progress.positionTicks > 0 ? `?t=${item.progress.positionTicks}` : ''}`
    : linkTo;

  const listMutation = useMutation({
    mutationFn: (status: MediaListStatus) => api.lists.upsert(item.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['user-lists'] });
      queryClient.invalidateQueries({ queryKey: ['list-entry', item.id] });
      setShowMenu(false);
    },
  });

  const quickAction = (e: React.MouseEvent, status: MediaListStatus) => {
    e.preventDefault();
    e.stopPropagation();
    listMutation.mutate(status);
  };

  return (
    <div className="group relative rounded-lg overflow-visible cursor-pointer">
      <div className="relative rounded-lg overflow-hidden bg-[#16202b] shadow-lg shadow-black/20">
      <Link to={linkTo} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className="aspect-video relative overflow-hidden bg-border dark:bg-border-dark">
          {item.posterPath ? (
            <img
              src={item.posterPath}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted dark:text-muted-dark text-xs bg-[#1b2733]">
              No Poster
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 focus-within:bg-black/35 transition-colors duration-300" />

          {/* Progress bar */}
          {progressPercent !== null && progressPercent < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          <div className="absolute left-3 right-3 bottom-2.5">
            <h3 className="font-semibold text-sm 2xl:text-base truncate text-white drop-shadow">{item.title}</h3>
            {hasEpisode ? (
              <div className="text-xs 2xl:text-sm text-primary mt-0.5 truncate font-medium">
                S{ep.seasonNumber}E{ep.episodeNumber} · {ep.episodeTitle}
              </div>
            ) : (
              item.year && <div className="text-xs 2xl:text-sm text-white/70 mt-0.5">{item.year}</div>
            )}
          </div>
        </div>
      </Link>

      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(playTo); }}
        className="play-overlay absolute left-1/2 top-1/2 z-10 w-12 h-12 2xl:w-16 2xl:h-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100 focus:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title="Play"
        aria-label={`Play ${item.title}`}
      >
        <Play size={20} className="text-black ml-0.5 2xl:!w-7 2xl:!h-7" fill="currentColor" />
      </button>

      {/* Quick action buttons — top-right corner on hover */}
      <div className="absolute top-1.5 right-1.5 2xl:top-3 2xl:right-3 flex flex-col gap-1 2xl:gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
        <button
          onClick={(e) => quickAction(e, 'Completed')}
          className="w-8 h-8 2xl:w-10 2xl:h-10 rounded-full bg-black/60 hover:bg-success/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          title="Mark as Completed"
        >
          <Check size={14} />
        </button>
        <button
          onClick={(e) => quickAction(e, 'Planned')}
          className="w-8 h-8 2xl:w-10 2xl:h-10 rounded-full bg-black/60 hover:bg-primary/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          title="Mark as Planned"
        >
          <Clock size={14} />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu); }}
          className="w-8 h-8 2xl:w-10 2xl:h-10 rounded-full bg-black/60 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
          title="More options"
        >
          <MoreVertical size={14} />
        </button>
      </div>
      </div>

      {/* 3-dot more menu dropdown */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-10 right-0 z-50 w-48 rounded-xl bg-surface dark:bg-surface-dark border border-border dark:border-border-dark shadow-2xl py-1.5">
            <button
              onClick={(e) => quickAction(e, 'Watching')}
              className="w-full text-left px-3 py-2 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors flex items-center gap-2"
            >
              <Play size={14} /> Watching
            </button>
            <button
              onClick={(e) => quickAction(e, 'Planned')}
              className="w-full text-left px-3 py-2 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors flex items-center gap-2"
            >
              <Clock size={14} /> Planned
            </button>
            <button
              onClick={(e) => quickAction(e, 'Completed')}
              className="w-full text-left px-3 py-2 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors flex items-center gap-2"
            >
              <Check size={14} /> Completed
            </button>
            <button
              onClick={(e) => quickAction(e, 'OnHold')}
              className="w-full text-left px-3 py-2 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors flex items-center gap-2"
            >
              <List size={14} /> On Hold
            </button>
            <button
              onClick={(e) => quickAction(e, 'Dropped')}
              className="w-full text-left px-3 py-2 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors flex items-center gap-2"
            >
              <List size={14} /> Dropped
            </button>
            <div className="border-t border-border dark:border-border-dark my-1" />
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); navigate(`/media/${item.id}`); }}
              className="w-full text-left px-3 py-2 text-sm text-text dark:text-text-dark hover:bg-border dark:hover:bg-border-dark transition-colors flex items-center gap-2"
            >
              <FolderPlus size={14} /> View Details
            </button>
          </div>
        </>
      )}
    </div>
  );
}
