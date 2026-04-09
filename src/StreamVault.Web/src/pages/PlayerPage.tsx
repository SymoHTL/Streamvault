import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ArrowLeft } from 'lucide-react';

// Shaka Player types
declare const shaka: {
  polyfill: { installAll: () => void };
  Player: {
    isBrowserSupported: () => boolean;
    new (videoElement: HTMLVideoElement): ShakaPlayer;
  };
};

interface ShakaPlayer {
  configure: (config: Record<string, unknown>) => void;
  load: (url: string) => Promise<void>;
  destroy: () => Promise<void>;
  addEventListener: (event: string, handler: (e: unknown) => void) => void;
}

export default function PlayerPage() {
  const { mediaFileId } = useParams<{ mediaFileId: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<ShakaPlayer | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reportProgress = useCallback(async () => {
    if (!videoRef.current || !mediaFileId) return;
    const video = videoRef.current;
    const positionTicks = Math.floor(video.currentTime * 10_000_000);
    const completed = video.ended || (video.duration > 0 && video.currentTime / video.duration > 0.95);
    try {
      await api.progress.update(mediaFileId, positionTicks, completed);
    } catch { /* ignore */ }
  }, [mediaFileId]);

  useEffect(() => {
    if (!mediaFileId || !videoRef.current) return;

    const video = videoRef.current;
    let cancelled = false;

    async function loadStream() {
      try {
        const { url } = await api.stream.getDirectUrl(mediaFileId!);
        if (cancelled) return;
        video.src = url;
        setLoading(false);
        video.play().catch(() => {});
      } catch (err) {
        if (cancelled) return;
        setError('Failed to load video stream');
        setLoading(false);
      }
    }

    loadStream();

    // Report progress every 10 seconds
    progressInterval.current = setInterval(reportProgress, 10_000);

    // Report on pause/end
    const handlePause = () => reportProgress();
    const handleEnded = () => reportProgress();
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      cancelled = true;
      if (progressInterval.current) clearInterval(progressInterval.current);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [mediaFileId, reportProgress]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          Loading...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400">
          {error}
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        autoPlay
        playsInline
      />
    </div>
  );
}
