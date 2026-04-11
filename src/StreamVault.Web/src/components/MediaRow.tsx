import { useRef } from 'react';
import type { MediaItemSummaryResponse } from '../types';
import MediaCard from './MediaCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  items: MediaItemSummaryResponse[];
  showEpisodeInfo?: boolean;
}

export default function MediaRow({ title, items, showEpisodeInfo }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className="mb-6 group/row relative">
      <h2 className="text-lg font-semibold mb-3 text-text dark:text-text-dark">{title}</h2>
      <div className="relative">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-2 z-10 w-10 flex items-center justify-center bg-gradient-to-r from-surface dark:from-surface-dark to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label="Scroll left"
        >
          <ChevronLeft size={24} className="text-text dark:text-text-dark" />
        </button>

        {/* Scroll container */}
        <div ref={scrollRef} className="media-scroll">
          {items.map((item) => (
            <div key={item.id} className="media-card-wrapper">
              <MediaCard item={item} showEpisodeInfo={showEpisodeInfo} />
            </div>
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-2 z-10 w-10 flex items-center justify-center bg-gradient-to-l from-surface dark:from-surface-dark to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label="Scroll right"
        >
          <ChevronRight size={24} className="text-text dark:text-text-dark" />
        </button>
      </div>
    </section>
  );
}
