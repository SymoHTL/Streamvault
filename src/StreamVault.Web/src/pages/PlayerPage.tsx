import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { ArrowLeft, Bug, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipForward, SkipBack, Languages, Cast, Subtitles, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AudioTrackInfo, SubtitleResponse, ChapterResponse, EpisodeContextResponse } from '../types';
import { useChromecast } from '../hooks/useChromecast';
import { usePreferencesStore } from '../stores/preferencesStore';
import SubtitleOverlay from '../components/SubtitleOverlay';
import i18n from '../i18n';

function langName(code: string): string {
  const key = `lang.${code.toLowerCase()}`;
  const result = i18n.t(key);
  return result === key ? code : result;
}

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

export default function PlayerPage() {
  const { t } = useTranslation();
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
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('sv_volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [muted, setMuted] = useState(() => localStorage.getItem('sv_muted') === 'true');
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
  const castMediaUrlRef = useRef('');
  const castContentTypeRef = useRef('video/mp4');

  // Subtitle state
  const [subtitles, setSubtitles] = useState<SubtitleResponse[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  // Chapter / skip intro state
  const [chapters, setChapters] = useState<ChapterResponse[]>([]);
  const [activeSkipChapter, setActiveSkipChapter] = useState<ChapterResponse | null>(null);

  // Episode context (prev/next, show name)
  const [episodeContext, setEpisodeContext] = useState<EpisodeContextResponse | null>(null);
  const episodeContextRef = useRef<EpisodeContextResponse | null>(null);
  const [mediaTitle, setMediaTitle] = useState('');

  // Active credits chapter for "next episode" prompt
  const [activeCreditsChapter, setActiveCreditsChapter] = useState<ChapterResponse | null>(null);

  // Normalize audio volume
  const [normalizeAudio, setNormalizeAudio] = useState(() => localStorage.getItem('sv_normalize_audio') === 'true');
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const prefs = usePreferencesStore();
  const chromecast = useChromecast();

  // Load preferences
  useEffect(() => { if (!prefs.loaded) prefs.load(); }, []);

  // Track current chapter for skip intro/recap
  useEffect(() => {
    if (chapters.length === 0) { setActiveSkipChapter(null); setActiveCreditsChapter(null); return; }
    const t = chromecast.isConnected ? chromecast.currentTime : currentTime;
    const skip = chapters.find(
      c => (c.chapterType === 'intro' || c.chapterType === 'recap') && t >= c.startSeconds && t < c.endSeconds
    );
    setActiveSkipChapter(skip ?? null);
    const credits = chapters.find(
      c => c.chapterType === 'credits' && t >= c.startSeconds && t < c.endSeconds
    );
    setActiveCreditsChapter(credits ?? null);
  }, [chapters, currentTime, chromecast.isConnected, chromecast.currentTime]);

  // Persist volume changes
  useEffect(() => {
    localStorage.setItem('sv_volume', String(volume));
    localStorage.setItem('sv_muted', String(muted));
  }, [volume, muted]);

  // Restore volume on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const savedVol = localStorage.getItem('sv_volume');
    const savedMuted = localStorage.getItem('sv_muted');
    if (savedVol !== null) video.volume = parseFloat(savedVol);
    if (savedMuted !== null) video.muted = savedMuted === 'true';
  }, []);

  // Audio normalization via Web Audio API
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !normalizeAudio) return;
    if (sourceNodeRef.current) return; // already connected

    try {
      const ctx = audioContextRef.current || new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaElementSource(video);
      sourceNodeRef.current = source;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1.4, ctx.currentTime);
      gainNodeRef.current = gain;

      source.connect(compressor);
      compressor.connect(gain);
      gain.connect(ctx.destination);
    } catch { /* Web Audio not available */ }
  }, [normalizeAudio, mediaFileId]);

  // Fetch episode context for nav and title
  useEffect(() => {
    if (!mediaFileId) return;
    api.stream.episodeContext(mediaFileId).then(ctx => {
      setEpisodeContext(ctx);
      episodeContextRef.current = ctx;
      setMediaTitle(`${ctx.showTitle} — S${ctx.seasonNumber}E${ctx.episodeNumber} ${ctx.episodeTitle}`);
    }).catch(() => {
      // Not an episode (movie) — try to get title from direct info
      setEpisodeContext(null);
      episodeContextRef.current = null;
    });
  }, [mediaFileId]);

  // When a cast session connects, send the current media to the Chromecast
  const isCastingRef = useRef(false);
  useEffect(() => {
    if (chromecast.isConnected && !isCastingRef.current && castMediaUrlRef.current) {
      isCastingRef.current = true;
      const video = videoRef.current;
      const startTime = video ? video.currentTime + seekOffsetRef.current : 0;
      // Pause local video
      video?.pause();
      chromecast.loadMedia(castMediaUrlRef.current, castContentTypeRef.current).then(() => {
        if (startTime > 0) chromecast.seek(startTime);
      }).catch(() => {});
    } else if (!chromecast.isConnected && isCastingRef.current) {
      isCastingRef.current = false;
      // Resume local playback at the cast position
      const video = videoRef.current;
      if (video && chromecast.currentTime > 0) {
        if (useRemux) {
          // Reload remux at cast position
          seekOffsetRef.current = chromecast.currentTime;
          const token = localStorage.getItem('accessToken');
          const remuxUrl = api.stream.remuxUrl(mediaFileId!, chromecast.currentTime, selectedAudioTrack);
          const streamUrl = `${remuxUrl}${remuxUrl.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token || '')}`;
          video.src = streamUrl;
        } else {
          video.currentTime = chromecast.currentTime;
        }
        video.play().catch(() => {});
      }
    }
  }, [chromecast.isConnected]);

  const reportProgress = useCallback(async () => {
    if (!mediaFileId) return;
    // Use cast time when casting, otherwise local video time
    let actualTime: number;
    if (isCastingRef.current && chromecast.isConnected) {
      actualTime = chromecast.currentTime;
      if (!actualTime || actualTime === 0) return;
    } else {
      if (!videoRef.current) return;
      actualTime = videoRef.current.currentTime + seekOffsetRef.current;
      if (isNaN(actualTime) || actualTime === 0) return;
    }
    const positionTicks = Math.floor(actualTime * 10_000_000);
    const video = videoRef.current;
    const effDur = knownDurationRef.current > 0
      ? knownDurationRef.current
      : (video && isFinite(video.duration) && video.duration > 0) ? video.duration + seekOffsetRef.current : 0;
    const completed = (video?.ended ?? false) || (effDur > 0 && actualTime / effDur > 0.95);
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
          // Set media title for movies (episodes override via episodeContext)
          if (info.title && !mediaTitle) setMediaTitle(info.title);
          if (info.durationSeconds) {
            setKnownDuration(info.durationSeconds);
            knownDurationRef.current = info.durationSeconds;
          }
          if (info.subtitles && info.subtitles.length > 0) {
            setSubtitles(info.subtitles);
            // Auto-select subtitle based on preference
            const prefLang = prefs.subtitleLanguage;
            if (prefLang) {
              const match = info.subtitles.find(s => s.language === prefLang);
              if (match) setSelectedSubtitleId(match.id);
            }
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
            // Auto-select preferred language from preferences or localStorage
            const preferred = prefs.audioLanguage || localStorage.getItem('preferredAudioLanguage');
            if (preferred && selectedAudioTrack === undefined) {
              const match = tracks.find(t => t.language === preferred);
              if (match && match.streamIndex !== 0) {
                setSelectedAudioTrack(match.streamIndex);
              }
            }
          }
        }).catch(() => {});

        // Fetch chapters for skip intro/recap
        api.stream.chapters(mediaFileId!).then(chs => {
          if (!cancelled) setChapters(chs);
        }).catch(() => {});

        video.src = streamUrl;
        // Store absolute URL for Chromecast casting
        if (canDirectPlay) {
          // Direct S3 URL is already absolute
          castMediaUrlRef.current = streamUrl;
          castContentTypeRef.current = container === 'webm' ? 'video/webm' : 'video/mp4';
        } else {
          // Remux needs absolute URL so Chromecast can reach the server
          castMediaUrlRef.current = `${window.location.origin}${streamUrl}`;
          castContentTypeRef.current = 'video/mp4';
        }
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
    const handleEnded = () => {
      reportProgress();
      setPaused(true);
      // Auto-advance to next episode
      const ctx = episodeContextRef.current;
      if (ctx?.nextEpisode) {
        navigate(`/player/${ctx.nextEpisode.mediaFileId}`, { replace: true });
      }
    };
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
    };

    // Seek to resume position only once we have actual playable data (readyState >= 3).
    // Seeking on `loadedmetadata` is too early — the audio decoder may not yet have
    // valid timestamps, which produces audible drift / desync after the seek lands.
    let seekDone = false;
    const handleCanPlay = () => {
      if (seekDone) return;
      // Remux mode embeds the seek in the URL — no client-side seek needed.
      if (seekOffsetRef.current !== 0) { seekDone = true; return; }

      const audioResume = sessionStorage.getItem('audioTrackResume');
      let target = 0;
      if (audioResume) {
        sessionStorage.removeItem('audioTrackResume');
        target = parseInt(audioResume, 10) / 10_000_000;
      } else if (resumeSecondsRef.current > 0) {
        target = resumeSecondsRef.current;
      }
      if (target > 0) {
        const v = video as HTMLVideoElement & { fastSeek?: (t: number) => void };
        if (typeof v.fastSeek === 'function') {
          v.fastSeek(target);
        } else {
          v.currentTime = target;
        }
      }
      seekDone = true;
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
    video.addEventListener('canplay', handleCanPlay);
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
      video.removeEventListener('canplay', handleCanPlay);
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

  // Media Session API for background play on mobile (like YT Premium, Netflix)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediaTitle || 'StreamVault',
    });
    navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      const v = videoRef.current; if (v) v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
    });
    if (episodeContext?.previousEpisode) {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        reportProgress();
        navigate(`/player/${episodeContext.previousEpisode!.mediaFileId}`, { replace: true });
      });
    }
    if (episodeContext?.nextEpisode) {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        reportProgress();
        navigate(`/player/${episodeContext.nextEpisode!.mediaFileId}`, { replace: true });
      });
    }
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [mediaTitle, episodeContext, navigate, reportProgress]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (chromecast.isConnected && chromecast.isMediaLoaded) {
            chromecast.playOrPause();
          } else {
            video.paused ? video.play() : video.pause();
          }
          resetControlsTimer();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (chromecast.isConnected && chromecast.isMediaLoaded) {
            chromecast.seek(Math.max(0, chromecast.currentTime - 10));
          } else {
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          resetControlsTimer();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (chromecast.isConnected && chromecast.isMediaLoaded) {
            chromecast.seek(Math.min(chromecast.duration, chromecast.currentTime + 10));
          } else {
            video.currentTime = Math.min(isFinite(video.duration) ? video.duration : Infinity, video.currentTime + 10);
          }
          resetControlsTimer();
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.05);
          resetControlsTimer();
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.05);
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
  const effectiveDuration = chromecast.isConnected && chromecast.duration > 0
    ? chromecast.duration
    : knownDuration > 0 && useRemux
      ? knownDuration
      : (isFinite(duration) && duration > 0) ? duration : knownDuration;

  const displayTime = chromecast.isConnected ? chromecast.currentTime : currentTime;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar || effectiveDuration === 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * effectiveDuration;

    if (chromecast.isConnected && chromecast.isMediaLoaded) {
      chromecast.seek(targetTime);
    } else {
      const video = videoRef.current;
      if (!video) return;
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

  const progressPct = effectiveDuration > 0 ? (displayTime / effectiveDuration) * 100 : 0;
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
        if ((e.target as HTMLElement).tagName === 'VIDEO' || (e.target as HTMLElement).closest('[data-cast-overlay]')) {
          // On touch devices, first tap shows controls; only toggle playback if controls are already visible
          const isTouch = e.detail === 0 || matchMedia('(pointer: coarse)').matches;
          if (isTouch && !showControls) {
            resetControlsTimer();
            return;
          }
          if (chromecast.isConnected && chromecast.isMediaLoaded) {
            chromecast.playOrPause();
          } else {
            const video = videoRef.current;
            if (video) video.paused ? video.play() : video.pause();
          }
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
      {loading && !chromecast.isConnected && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Cast overlay */}
      {chromecast.isConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 pointer-events-none">
          <Cast size={64} className="text-white/60 mb-4" />
          <p className="text-white text-xl font-medium">{t('player.castingTo', { name: chromecast.deviceName })}</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
          <div className="text-center max-w-md p-6">
            <p className="text-red-400 text-lg mb-4">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setError(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-2"
              >
                <X size={16} /> {t('player.dismiss', 'Dismiss')}
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
              >
                {t('player.goBack', 'Go Back')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 z-20 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => { reportProgress(); navigate(-1); }}
            className="p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          {mediaTitle && (
            <h1 className="text-white text-sm sm:text-base font-medium truncate max-w-[60%]">{mediaTitle}</h1>
          )}
          <button
            onClick={() => setShowDebug(prev => !prev)}
            className={`p-2 rounded-full text-white transition-colors ml-auto ${showDebug ? 'bg-primary' : 'bg-black/30 hover:bg-black/50'}`}
            title={t('player.toggleDebug')}
          >
            <Bug size={18} />
          </button>
        </div>
      </div>

      {/* Debug overlay */}
      {showDebug && debugInfo && (
        <div className="absolute top-16 right-4 bg-black/80 text-green-400 text-xs font-mono p-3 rounded-lg max-w-xs leading-relaxed pointer-events-none z-20">
          <div className="text-green-300 font-bold mb-1">{t('player.debug')}</div>
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

      {/* Subtitle overlay */}
      {selectedSubtitleId && (
        <SubtitleOverlay
          subtitleUrl={api.stream.subtitleUrl(mediaFileId!, selectedSubtitleId)}
          currentTime={displayTime}
          size={prefs.subtitleSize ?? undefined}
          color={prefs.subtitleColor ?? undefined}
          background={prefs.subtitleBackground ?? undefined}
          font={prefs.subtitleFont ?? undefined}
        />
      )}

      {/* Skip intro/recap button */}
      {activeSkipChapter && showControls && (
        <button
          onClick={() => {
            const target = activeSkipChapter.endSeconds;
            if (chromecast.isConnected && chromecast.isMediaLoaded) {
              chromecast.seek(target);
            } else {
              const video = videoRef.current;
              if (video) {
                if (useRemux) {
                  seekOffsetRef.current = target;
                  const token = localStorage.getItem('accessToken');
                  const remuxUrl = api.stream.remuxUrl(mediaFileId!, target, selectedAudioTrack);
                  const streamUrl = `${remuxUrl}${remuxUrl.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token || '')}`;
                  video.src = streamUrl;
                  video.play().catch(() => {});
                  setCurrentTime(target);
                  setLoading(true);
                } else {
                  video.currentTime = target;
                }
              }
            }
          }}
          className="absolute bottom-28 right-6 z-20 px-5 py-2.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-sm font-medium rounded-full hover:bg-white/30 transition-colors"
        >
          Skip {activeSkipChapter.chapterType === 'intro' ? t('player.intro') : t('player.recap')} →
        </button>
      )}

      {/* Next episode button during credits/outro */}
      {activeCreditsChapter && episodeContext?.nextEpisode && showControls && (
        <button
          onClick={() => {
            reportProgress();
            navigate(`/player/${episodeContext.nextEpisode!.mediaFileId}`, { replace: true });
          }}
          className="absolute bottom-28 right-6 z-20 px-6 py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors shadow-lg flex items-center gap-2"
        >
          <Play size={16} fill="currentColor" />
          {t('player.nextEpisode', 'Next Episode')} — S{episodeContext.nextEpisode.seasonNumber}E{episodeContext.nextEpisode.episodeNumber}
        </button>
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
          {/* Previous episode */}
          {episodeContext?.previousEpisode && (
            <button
              onClick={() => {
                reportProgress();
                navigate(`/player/${episodeContext.previousEpisode!.mediaFileId}`, { replace: true });
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              title={`S${episodeContext.previousEpisode.seasonNumber}E${episodeContext.previousEpisode.episodeNumber} ${episodeContext.previousEpisode.title}`}
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Play/Pause */}
          <button
            onClick={() => {
              if (chromecast.isConnected && chromecast.isMediaLoaded) {
                chromecast.playOrPause();
              } else {
                const v = videoRef.current; if (v) v.paused ? v.play() : v.pause();
              }
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            {(chromecast.isConnected ? chromecast.isPaused : paused) ? <Play size={22} /> : <Pause size={22} />}
          </button>

          {/* Next episode */}
          {episodeContext?.nextEpisode && (
            <button
              onClick={() => {
                reportProgress();
                navigate(`/player/${episodeContext.nextEpisode!.mediaFileId}`, { replace: true });
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              title={`S${episodeContext.nextEpisode.seasonNumber}E${episodeContext.nextEpisode.episodeNumber} ${episodeContext.nextEpisode.title}`}
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* Skip back 10s */}
          <button
            onClick={() => {
              if (chromecast.isConnected && chromecast.isMediaLoaded) {
                chromecast.seek(Math.max(0, chromecast.currentTime - 10));
              } else {
                const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10);
              }
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Back 10s"
          >
            <SkipBack size={18} />
          </button>

          {/* Skip forward 10s */}
          <button
            onClick={() => {
              if (chromecast.isConnected && chromecast.isMediaLoaded) {
                chromecast.seek(Math.min(chromecast.duration, chromecast.currentTime + 10));
              } else {
                const v = videoRef.current; if (v) v.currentTime = Math.min(isFinite(v.duration) ? v.duration : Infinity, v.currentTime + 10);
              }
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Forward 10s"
          >
            <SkipForward size={18} />
          </button>

          {/* Time display */}
          <span className="text-sm font-mono tabular-nums">
            {formatTime(displayTime)} / {formatTime(effectiveDuration)}
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
              step="0.01"
              value={muted ? 0 : volume}
              onChange={handleVolumeInputChange}
              className="w-24 h-1 accent-primary cursor-pointer"
            />
            <button
              onClick={() => {
                const next = !normalizeAudio;
                setNormalizeAudio(next);
                localStorage.setItem('sv_normalize_audio', String(next));
                if (!next && sourceNodeRef.current && audioContextRef.current) {
                  // Disconnect normalization, reconnect direct
                  try {
                    sourceNodeRef.current.disconnect();
                    sourceNodeRef.current.connect(audioContextRef.current.destination);
                  } catch { /* ignore */ }
                }
              }}
              className={`p-1 rounded text-[10px] font-bold leading-none transition-colors ${normalizeAudio ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
              title={t('player.normalizeVolume', 'Normalize Volume')}
            >
              N
            </button>
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
                    const channelLabel = track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : `${track.channels}ch`;
                    const label = lang !== 'Unknown'
                      ? (track.title ? `${lang} — ${track.title}` : lang)
                      : (track.title || `${t('player.track', { n: track.streamIndex + 1 })}`);
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

          {/* Subtitle tracks */}
          {subtitles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSubtitleMenu(prev => !prev)}
                className={`p-1.5 rounded-lg transition-colors ${showSubtitleMenu ? 'bg-white/20' : selectedSubtitleId ? 'text-primary hover:bg-white/10' : 'hover:bg-white/10'}`}
                title="Subtitles"
              >
                <Subtitles size={18} />
              </button>
              {showSubtitleMenu && (
                <div className="absolute bottom-full mb-2 right-0 w-56 rounded-lg bg-black/90 border border-white/20 shadow-lg py-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedSubtitleId(null); setShowSubtitleMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      !selectedSubtitleId ? 'text-primary bg-white/10' : 'text-white hover:bg-white/10'
                    }`}
                  >
                    Off
                  </button>
                  {subtitles.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => { setSelectedSubtitleId(sub.id); setShowSubtitleMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selectedSubtitleId === sub.id ? 'text-primary bg-white/10' : 'text-white hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{langName(sub.language)}</span>
                        <span className="text-xs text-white/50">{sub.format}{sub.isForced ? ` · ${t('media.forced')}` : ''}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chromecast */}
          {chromecast.isAvailable && (
            <button
              onClick={() => chromecast.isConnected ? chromecast.disconnect() : chromecast.cast()}
              className={`p-1.5 rounded-lg transition-colors ${chromecast.isConnected ? 'text-primary bg-white/10' : 'hover:bg-white/10'}`}
              title={chromecast.isConnected ? t('player.castingTo', { name: chromecast.deviceName }) : t('player.cast')}
            >
              <Cast size={18} />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title={t('player.fullscreen')}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
