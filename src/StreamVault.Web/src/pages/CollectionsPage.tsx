import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import MediaCard from '../components/MediaCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, FolderOpen, Trash2 } from 'lucide-react';

export default function CollectionsPage() {
  const { id } = useParams<{ id: string }>();

  if (id) return <CollectionDetail id={id} />;
  return <CollectionsList />;
}

function CollectionsList() {
  const queryClient = useQueryClient();
  const { data: collections, isLoading } = useQuery({ queryKey: ['collections'], queryFn: api.collections.list });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.collections.create(name, description || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setShowForm(false);
      setName('');
      setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.collections.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text dark:text-text-dark">Collections</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Collection
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark mb-6 space-y-3">
          <input
            placeholder="Collection name (e.g. Harry Potter, MCU)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-sm focus:ring-2 focus:ring-primary outline-none"
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-text dark:text-text-dark text-sm focus:ring-2 focus:ring-primary outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name || createMutation.isPending}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark text-text dark:text-text-dark rounded-lg text-sm hover:bg-border dark:hover:bg-border-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="text-muted dark:text-muted-dark">Loading...</div>}

      {collections && collections.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted dark:text-muted-dark">
          <FolderOpen size={48} className="mx-auto mb-3 opacity-50" />
          <p>No collections yet.</p>
          <p className="text-sm mt-1">Create one to group related movies and shows together.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {collections?.map((c) => (
          <Link
            key={c.id}
            to={`/collections/${c.id}`}
            className="group block rounded-xl overflow-hidden bg-surface-secondary dark:bg-surface-secondary-dark border border-border dark:border-border-dark hover:ring-2 hover:ring-primary transition-all"
          >
            <div className="aspect-[16/9] relative overflow-hidden bg-border dark:bg-border-dark">
              {c.posterUrl ? (
                <img src={c.posterUrl} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted dark:text-muted-dark">
                  <FolderOpen size={32} />
                </div>
              )}
            </div>
            <div className="p-4 flex items-start justify-between">
              <div>
                <h3 className="font-medium text-text dark:text-text-dark">{c.name}</h3>
                <p className="text-xs text-muted dark:text-muted-dark mt-0.5">
                  {c.itemCount} items{c.isAutoGenerated && ' · TMDB'}
                </p>
                {c.description && <p className="text-xs text-muted dark:text-muted-dark mt-1 line-clamp-2">{c.description}</p>}
              </div>
              {!c.isAutoGenerated && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: c.id, name: c.name }); }}
                  className="p-1.5 rounded-lg hover:bg-danger/10 text-danger shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </Link>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This will delete the collection. The media items themselves won't be affected."
        confirmLabel="Delete Collection"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}

function CollectionDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: collection, isLoading } = useQuery({
    queryKey: ['collection', id],
    queryFn: () => api.collections.get(id),
  });

  const removeItemMutation = useMutation({
    mutationFn: (mediaItemId: string) => api.collections.removeItem(id, mediaItemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collection', id] }),
  });

  if (isLoading) return <div className="text-muted dark:text-muted-dark">Loading...</div>;
  if (!collection) return <div className="text-muted dark:text-muted-dark">Not found</div>;

  return (
    <div>
      <div className="mb-6">
        <Link to="/collections" className="text-sm text-primary hover:underline mb-2 inline-block">← Back to Collections</Link>
        <h1 className="text-2xl font-bold text-text dark:text-text-dark">{collection.name}</h1>
        {collection.description && (
          <p className="text-sm text-muted dark:text-muted-dark mt-1">{collection.description}</p>
        )}
      </div>

      {collection.items.length === 0 && (
        <div className="text-center py-12 text-muted dark:text-muted-dark">
          <p>No items in this collection yet.</p>
          <p className="text-sm mt-1">Add items from their detail pages.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {collection.items.map((item) => (
          <div key={item.id} className="relative group/item">
            <MediaCard item={item} />
            <button
              onClick={() => removeItemMutation.mutate(item.id)}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-danger"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
