import type { MediaItemSummaryResponse } from '../types';
import MediaCard from './MediaCard';

interface Props {
  title: string;
  items: MediaItemSummaryResponse[];
}

export default function MediaRow({ title, items }: Props) {
  if (!items.length) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4 text-text dark:text-text-dark">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
