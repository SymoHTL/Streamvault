import { Link } from 'react-router-dom';
import type { MediaItemSummaryResponse } from '../types';
import { Star } from 'lucide-react';

interface Props {
  item: MediaItemSummaryResponse;
}

export default function MediaCard({ item }: Props) {
  const progressPercent = item.progress && item.progress.durationSeconds
    ? Math.round((item.progress.positionTicks / (item.progress.durationSeconds * 10_000_000)) * 100)
    : null;

  return (
    <Link
      to={`/media/${item.id}`}
      className="group block rounded-xl overflow-hidden bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark hover:ring-2 hover:ring-primary transition-all"
    >
      <div className="aspect-[2/3] relative overflow-hidden bg-border dark:bg-border-dark">
        {item.posterPath ? (
          <img
            src={item.posterPath}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted dark:text-muted-dark text-sm">
            No Poster
          </div>
        )}
        {progressPercent !== null && progressPercent < 100 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-border dark:bg-border-dark">
            <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm truncate text-text dark:text-text-dark">{item.title}</h3>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted dark:text-muted-dark">
          {item.year && <span>{item.year}</span>}
          {item.communityRating && (
            <span className="flex items-center gap-0.5">
              <Star size={12} className="text-yellow-500 fill-yellow-500" />
              {item.communityRating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
