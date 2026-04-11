import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { ArrowLeft, Bug, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipForward, SkipBack, Languages } from 'lucide-react';
import type { AudioTrackInfo } from '../types';

interface DebugInfo {
  currentTime: number;
  duration: number;
  buffered: string;
  readyState: number;
  networkState: number;
  videoWidth: number;
  videoHeight: number;
  playbackRate: number;
  paused: boolean;
  seeking: boolean;
  src: string;
  container: string;
  videoCodec: string;
  audioCodec: string;
  resolution: string;
  error: string | null;
  droppedFrames: number;
  totalFrames: number;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getBufferedRanges(video: HTMLVideoElement): string {
  const ranges: string[] = [];
  for (let i = 0; i < video.buffered.length; i++) {
    ranges.push(`${formatTime(video.buffered.start(i))}-${formatTime(video.buffered.end(i))}`);
  }
  return ranges.join(', ') || 'none';
}

const LANG_NAMES: Record<string, string> = {
  eng: 'English', deu: 'German', ger: 'German', fra: 'French', fre: 'French',
  spa: 'Spanish', ita: 'Italian', por: 'Portuguese', rus: 'Russian', jpn: 'Japanese',
  kor: 'Korean', zho: 'Chinese', chi: 'Chinese', hin: 'Hindi', ara: 'Arabic',
  tur: 'Turkish', pol: 'Polish', nld: 'Dutch', dut: 'Dutch', swe: 'Swedish',
  nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', ces: 'Czech', cze: 'Czech',
  hun: 'Hungarian', ron: 'Romanian', rum: 'Romanian', tha: 'Thai', vie: 'Vietnamese',
  ind: 'Indonesian', msa: 'Malay', may: 'Malay', heb: 'Hebrew', ell: 'Greek',
  gre: 'Greek', ukr: 'Ukrainian', bul: 'Bulgarian', hrv: 'Croatian', srp: 'Serbian',
  slk: 'Slovak', slo: 'Slovak', slv: 'Slovenian', cat: 'Catalan', eus: 'Basque',
  glg: 'Galician', lat: 'Latin', und: 'Unknown',
};

function langName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] || code;
}

export default function PlayerPage() {
  const { mediaFileId } = useParams<{ mediaFileId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval>>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [containerType, setContainerType] = useState('');
  const [videoCodec, setVideoCodec] = useState('');
  const [audioCodec, setAudioCodec] = useState('');
  const [resolution, setResolution] = useState('');
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | undefined>(undefined);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [useRemux, setUseRemux] = useState(false);
  const [knownDuration, setKnownDuration] = useState(0);
  const seekOffsetRef = useRef(0);
  const knownDurationRef = useRef(0);
  const resumeSecondsRef = useRef(0);

  const reportProgress = useCallback(async () => {
    if (!videoRef.current || !mediaFileId) return;
    const video = videoRef.current;
    const actualTime = video.currentTime + seekOffsetRef.current;
    if (isNaN(actualTime) || actualTime === 0) return;
    const positionTicks = Math.floor(actualTime * 10_000_000);
    const effDur = knownDurationRef.current > 0
      ? knownDurationRef.current
      : (isFinite(video.duration) && video.duration > 0) ? video.duration + seekOffsetRef.current : 0;
    const completed = video.ended || (effDur > 0 && actualTime / effDur > 0.95);
    try {
      await api.progress.update(mediaFileId, positionTicks, completed);
    } catch { /* ignore */ }
  }, [mediaFileId]);

  // Load the video stream
  useEffect(() => {
    if (!mediaFileId || !videoRef.current) return;
    const video = videoRef.current;
    let cancelled = false;

    async function loadStream() {
      try {
        seekOffsetRef.current = 0;
        // Get media file info for debug and to determine container type
        let container = '';
        let fileAudioCodec = '';
        let resumeSeconds = 0;
        try {
          const info = await api.stream.getDirectUrl(mediaFileId!);
          container = info.container || '';
          fileAudioCodec = info.audioCodec || '';
          setContainerType(container);
          setVideoCodec(info.videoCodec || '');
          setAudioCodec(fileAudioCodec);
          setResolution(info.resolution || '');
          if (info.durationSeconds) {
            setKnownDuration(info.durationSeconds);
            knownDurationRef.current = info.durationSeconds;
          }
        } catch { /* ignore */ }

        // Fetch saved watch progress (prefer ?t= param, then API)
        const startAtParam = searchParams.get('t');
        if (startAtParam) {
          resumeSeconds = parseInt(startAtParam, 10) / 10_000_000;
        } else {
          try {
            const progress = await api.progress.get(mediaFileId!);
            if (progress && !progress.completed && progress.positionTicks > 0) {
              resumeSeconds = progress.positionTicks / 10_000_000;
            }
          } catch { /* 404 = no progress, ignore */ }
        }
        resumeSecondsRef.current = resumeSeconds;

        if (cancelled) return;

        const token = localStorage.getItem('accessToken');
        let streamUrl: string;

        // Browser-compatible audio codecs that don't need remuxing
        const browserAudioCodecs = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];
        const audioLower = fileAudioCodec.toLowerCase();
        const needsRemux = !browserAudioCodecs.some(c => audioLower.includes(c));

        // Direct play priority: use pre-signed S3 URL for MP4/WebM with compatible audio
        // Only fall back to remux for incompatible containers or audio codecs
        const canDirectPlay = (container === 'mp4' || container === 'webm') && !needsRemux;
        const isRemux = !canDirectPlay;
        setUseRemux(isRemux);

        if (canDirectPlay) {
          // True direct play: use the pre-signed S3 URL (no proxy, native seeking)
          try {
            const directInfo = await api.stream.getDirectUrl(mediaFileId!);
            streamUrl = directInfo.url;
          } catch {
            // Fallback to proxy if pre-signed URL fails
            const proxyUrl = api.stream.proxyUrl(mediaFileId!);
            streamUrl = `${proxyUrl}?access_token=${encodeURIComponent(token || '')}`;
          }
        } else {
          // Remux: ffmpeg transcodes audio to AAC, copies video, outputs fragmented MP4
          const startPos = resumeSeconds > 0 ? resumeSeconds : undefined;
          if (startPos) seekOffsetRef.current = startPos;
          const remuxUrl = api.stream.remuxUrl(mediaFileId!, startPos, selectedAudioTrack);
          streamUrl = `${remuxUrl}${remuxUrl.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token || '')}`;
        }

        // Fetch audio tracks in the background
        api.stream.audioTracks(mediaFileId!).then(tracks => {
          if (!cancelled && tracks.length > 0) {
            setAudioTracks(tracks);
            // Auto-select preferred language from localStorage
            const preferred = localStorage.getItem('preferredAudioLanguage');
            if (preferred && selectedAudioTrack === undefined) {
              const match = tracks.find(t => t.language === preferred);
              if (match && match.streamIndex !== 0) {
                setSelectedAudioTrack(match.streamIndex);
              }
            }
          }
        }).catch(() => {});

        video.src = streamUrl;
        setLoading(false);

        // Don't set currentTime here - wait for loadedmetadata event
        video.play().catch(() => {});
      } catch {
        if (cancelled) return;
        setError('Failed to load video stream');
        setLoading(false);
      }
    }

    loadStream();

    // Report progress every 10 seconds
    progressInterval.current = setInterval(reportProgress, 10_000);

    const handlePause = () => { reportProgress(); setPaused(true); };
    const handlePlay = () => setPaused(false);
    const handleEnded = () => { reportProgress(); setPaused(true); };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime + seekOffsetRef.current);
      // Only update duration from video element when we don't have a known API duration.
      // In remux mode, video.duration reflects only what's been remuxed so far;
      // the real duration comes from knownDurationRef (API-provided).
      if (knownDurationRef.current <= 0 && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration + seekOffsetRef.current);
      }
    };
    const handleLoadedMetadata = () => {
      if (knownDurationRef.current <= 0 && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration + seekOffsetRef.current);
      }
      setLoading(false);
      // Restore position from audio track switch or saved progress (only when not remux-seeking)
      if (seekOffsetRef.current === 0) {
        const audioResume = sessionStorage.getItem('audioTrackResume');
        if (audioResume) {
          sessionStorage.removeItem('audioTrackResume');
          const startSeconds = parseInt(audioResume, 10) / 10_000_000;
          if (startSeconds > 0) {
            video.currentTime = startSeconds;
          }
        } else if (resumeSecondsRef.current > 0) {
          video.currentTime = resumeSecondsRef.current;
        }
      }
    };
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const handleError = () => {
      const errMsg = video.error ? `Error code ${video.error.code}: ${video.error.message}` : 'Unknown error';
      setError(errMsg);
    };

    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('error', handleError);

    return () => {
      cancelled = true;
      reportProgress();
      if (progressInterval.current) clearInterval(progressInterval.current);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('error', handleError);
    };
  }, [mediaFileId, reportProgress, selectedAudioTrack]);

  // Handle audio track change - restart stream at current position  
  const handleAudioTrackChange = useCallback((trackIndex: number) => {
    if (!useRemux) return; // Can only switch audio tracks in remux mode
    const video = videoRef.current;
    const currentPos = video?.currentTime ?? 0;
    setSelectedAudioTrack(trackIndex);
    // Save preference
    const track = audioTracks.find(t => t.streamIndex === trackIndex);
    if (track) {
      localStorage.setItem('preferredAudioLanguage', track.language);
    }
    setShowAudioMenu(false);
    // The useEffect will reload the stream with the new track
    // We need to resume from current position (including seek offset)
    const actualPos = currentPos + seekOffsetRef.current;
    if (actualPos > 0 && video) {
      const ticks = Math.floor(actualPos * 10_000_000);
      // Store resume position for the reload
      sessionStorage.setItem('audioTrackResume', String(ticks));
    }
  }, [useRemux, audioTracks]);

  // Update debug info periodically
  useEffect(() => {
    if (!showDebug) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const quality = (video as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number } }).getVideoPlaybackQuality?.();
      setDebugInfo({
        currentTime: video.currentTime,
        duration: video.duration,
        buffered: getBufferedRanges(video),
        readyState: video.readyState,
        networkState: video.networkState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        playbackRate: video.playbackRate,
        paused: video.paused,
        seeking: video.seeking,
        src: video.src.substring(0, 80) + '...',
        container: containerType,
        videoCodec: videoCodec,
        audioCodec: audioCodec,
        resolution: resolution,
        error: video.error ? `Code ${video.error.code}: ${video.error.message}` : null,
        droppedFrames: quality?.droppedVideoFrames ?? 0,
        totalFrames: quality?.totalVideoFrames ?? 0,
      });
    }, 500);
    return () => clearInterval(interval);
  }, [showDebug, containerType, videoCodec, audioCodec, resolution]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setShowControls(false);
    }, 3000);
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          resetControlsTimer();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          resetControlsTimer();
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(isFinite(video.duration) ? video.duration : Infinity, video.currentTime + 10);
          resetControlsTimer();
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          resetControlsTimer();
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          resetControlsTimer();
          break;
        case 'm':
          e.preventDefault();
          video.muted = !video.muted;
          resetControlsTimer();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'd':
          e.preventDefault();
          setShowDebug(prev => !prev);
          break;
        case 'Escape':
          if (!document.fullscreenElement) navigate(-1);
          break;
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [navigate, resetControlsTimer]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  // Derive effective duration: for remux streams prefer the API-provided duration
  // since video.duration grows as ffmpeg outputs more data
  const effectiveDuration = knownDuration > 0 && useRemux
    ? knownDuration
    : (isFinite(duration) && duration > 0) ? duration : knownDuration;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = progressBarRef.current;
    if (!video || !bar || effectiveDuration === 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * effectiveDuration;

    if (useRemux) {
      // Remux stream can't seek natively - reload stream at new position
      seekOffsetRef.current = targetTime;
      const token = localStorage.getItem('accessToken');
      const remuxUrl = api.stream.remuxUrl(mediaFileId!, targetTime, selectedAudioTrack);
      const streamUrl = `${remuxUrl}${remuxUrl.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token || '')}`;
      video.src = streamUrl;
      video.play().catch(() => {});
      setCurrentTime(targetTime);
      setLoading(true);
    } else {
      // Direct/proxy mode: native seek
      video.currentTime = Math.min(targetTime, effectiveDuration * 0.99);
    }
    resetControlsTimer();
  };

  const handleVolumeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const vol = parseFloat(e.target.value);
    video.volume = vol;
    video.muted = vol === 0;
  };

  const progressPct = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;
  const bufferedPct = (() => {
    const video = videoRef.current;
    if (!video || effectiveDuration === 0) return 0;
    for (let i = video.buffered.length - 1; i >= 0; i--) {
      if (video.buffered.start(i) <= video.currentTime) {
        // In remux mode, buffered ranges are relative to the remux start.
        // Add seekOffset to translate to absolute file position.
        return ((video.buffered.end(i) + seekOffsetRef.current) / effectiveDuration) * 100;
      }
    }
    return 0;
  })();

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex flex-col select-none"
      onMouseMove={resetControlsTimer}
      onClick={(e) => {
        // Click on video area = toggle play/pause
        if ((e.target as HTMLElement).tagName === 'VIDEO') {
          const video = videoRef.current;
          if (video) video.paused ? video.play() : video.pause();
          resetControlsTimer();
        }
      }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md p-6">
            <p className="text-red-400 text-lg mb-4">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => { reportProgress(); navigate(-1); }}
            className="p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <button
            onClick={() => setShowDebug(prev => !prev)}
            className={`p-2 rounded-full text-white transition-colors ml-auto ${showDebug ? 'bg-primary' : 'bg-black/30 hover:bg-black/50'}`}
            title="Toggle debug info (D)"
          >
            <Bug size={18} />
          </button>
        </div>
      </div>

      {/* Debug overlay */}
      {showDebug && debugInfo && (
        <div className="absolute top-16 right-4 bg-black/80 text-green-400 text-xs font-mono p-3 rounded-lg max-w-xs leading-relaxed pointer-events-none z-20">
          <div className="text-green-300 font-bold mb-1">Player Debug</div>
          <div>Time: {formatTime(debugInfo.currentTime)} / {formatTime(debugInfo.duration)}</div>
          <div>Resolution: {debugInfo.videoWidth}x{debugInfo.videoHeight}</div>
          <div>Container: {debugInfo.container || 'unknown'}</div>
          <div>Video Codec: {debugInfo.videoCodec || 'unknown'}</div>
          <div>Audio Codec: {debugInfo.audioCodec || 'unknown'}</div>
          <div>File Resolution: {debugInfo.resolution || 'unknown'}</div>
          <div>Playback Rate: {debugInfo.playbackRate}x</div>
          <div>Ready State: {debugInfo.readyState} ({['NOTHING', 'METADATA', 'CURRENT_DATA', 'FUTURE_DATA', 'ENOUGH_DATA'][debugInfo.readyState] || '?'})</div>
          <div>Network State: {debugInfo.networkState} ({['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'][debugInfo.networkState] || '?'})</div>
          <div>Buffered: {debugInfo.buffered}</div>
          <div>Paused: {debugInfo.paused ? 'Yes' : 'No'} | Seeking: {debugInfo.seeking ? 'Yes' : 'No'}</div>
          <div>Frames: {debugInfo.totalFrames} total, {debugInfo.droppedFrames} dropped</div>
          {debugInfo.error && <div className="text-red-400">Error: {debugInfo.error}</div>}
          <div className="text-gray-500 mt-1 break-all">Src: {debugInfo.src}</div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        data-controls
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-4 px-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Progress bar */}
        <div
          ref={progressBarRef}
          className="w-full h-2 bg-white/20 rounded-full cursor-pointer mb-3 group relative"
          onClick={handleSeek}
        >
          {/* Buffered */}
          <div
            className="absolute top-0 left-0 h-full bg-white/30 rounded-full pointer-events-none"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Progress */}
          <div
            className="absolute top-0 left-0 h-full bg-primary rounded-full pointer-events-none"
            style={{ width: `${progressPct}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `calc(${progressPct}% - 8px)` }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-3 text-white">
          {/* Play/Pause */}
          <button
            onClick={() => { const v = videoRef.current; if (v) v.paused ? v.play() : v.pause(); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            {paused ? <Play size={22} /> : <Pause size={22} />}
          </button>

          {/* Skip back 10s */}
          <button
            onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Back 10s"
          >
            <SkipBack size={18} />
          </button>

          {/* Skip forward 10s */}
          <button
            onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.min(isFinite(v.duration) ? v.duration : Infinity, v.currentTime + 10); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Forward 10s"
          >
            <SkipForward size={18} />
          </button>

          {/* Time display */}
          <span className="text-sm font-mono tabular-nums">
            {formatTime(currentTime)} / {formatTime(effectiveDuration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeInputChange}
              className="w-20 h-1 accent-primary cursor-pointer"
            />
          </div>

          {/* Audio tracks */}
          {audioTracks.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowAudioMenu(prev => !prev)}
                className={`p-1.5 rounded-lg transition-colors ${showAudioMenu ? 'bg-white/20' : 'hover:bg-white/10'}`}
                title="Audio Track"
              >
                <Languages size={18} />
              </button>
              {showAudioMenu && (
                <div className="absolute bottom-full mb-2 right-0 w-56 rounded-lg bg-black/90 border border-white/20 shadow-lg py-1 max-h-64 overflow-y-auto">
                  {audioTracks.map((track) => {
                    const lang = langName(track.language);
                    const label = track.title || (lang !== 'Unknown' ? lang : `Track ${track.streamIndex + 1}`);
                    const channelLabel = track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : `${track.channels}ch`;
                    const isSelected = selectedAudioTrack === track.streamIndex || (selectedAudioTrack === undefined && track.streamIndex === 0);
                    return (
                      <button
                        key={track.streamIndex}
                        onClick={() => handleAudioTrackChange(track.streamIndex)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          isSelected ? 'text-primary bg-white/10' : 'text-white hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{label}</span>
                          <span className="text-xs text-white/50">{track.codec} · {channelLabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
