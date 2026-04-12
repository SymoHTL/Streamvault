import { useState, useEffect, useCallback, useRef } from 'react';

const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

let sdkLoadPromise: Promise<boolean> | null = null;

function loadCastSdk(): Promise<boolean> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise<boolean>((resolve) => {
    // SDK already loaded
    if (window.__onGCastApiAvailable !== undefined && typeof chrome !== 'undefined' && chrome.cast) {
      resolve(true);
      return;
    }
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      resolve(isAvailable);
    };
    const script = document.createElement('script');
    script.src = CAST_SDK_URL;
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

export interface CastState {
  isAvailable: boolean;
  isConnected: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  deviceName: string;
  isMediaLoaded: boolean;
}

export interface UseChromecastReturn extends CastState {
  cast: () => void;
  disconnect: () => void;
  loadMedia: (url: string, contentType: string, title?: string) => Promise<void>;
  playOrPause: () => void;
  seek: (time: number) => void;
  stop: () => void;
}

export function useChromecast(): UseChromecastReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [deviceName, setDeviceName] = useState('');
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);

  const playerRef = useRef<cast.framework.RemotePlayer | null>(null);
  const controllerRef = useRef<cast.framework.RemotePlayerController | null>(null);
  const initializedRef = useRef(false);

  // Initialize Cast SDK
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const available = await loadCastSdk();
      if (cancelled) return;
      if (!available) return;

      try {
        const context = cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: cast.framework.AutoJoinPolicy.ORIGIN_SCOPED,
        });

        const player = new cast.framework.RemotePlayer();
        const controller = new cast.framework.RemotePlayerController(player);
        playerRef.current = player;
        controllerRef.current = controller;
        initializedRef.current = true;

        setIsAvailable(true);

        // Sync initial state
        if (player.isConnected) {
          setIsConnected(true);
          setDeviceName(player.displayName || '');
        }
      } catch {
        // Cast SDK init failed - probably not a Chromium browser
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Listen to remote player changes
  useEffect(() => {
    const controller = controllerRef.current;
    const player = playerRef.current;
    if (!controller || !player) return;

    const handleChange = (e: cast.framework.RemotePlayerChangedEvent) => {
      switch (e.field) {
        case 'isConnected':
          setIsConnected(player.isConnected);
          if (player.isConnected) {
            const session = cast.framework.CastContext.getInstance().getCurrentSession();
            setDeviceName(session?.getCastDevice().friendlyName || player.displayName || 'Chromecast');
          } else {
            setDeviceName('');
            setIsMediaLoaded(false);
          }
          break;
        case 'isPaused':
          setIsPaused(player.isPaused);
          break;
        case 'currentTime':
          setCurrentTime(player.currentTime);
          break;
        case 'duration':
          setDuration(player.duration);
          break;
        case 'isMediaLoaded':
          setIsMediaLoaded(player.isMediaLoaded);
          break;
        case 'playerState':
          setIsPaused(player.isPaused);
          break;
      }
    };

    controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, handleChange);
    return () => {
      controller.removeEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, handleChange);
    };
  }, [isAvailable]);

  // Listen to session state changes
  useEffect(() => {
    if (!isAvailable) return;

    const context = cast.framework.CastContext.getInstance();
    const handleSessionState = (event: cast.framework.SessionStateEventData) => {
      const { sessionState } = event;
      if (
        sessionState === cast.framework.SessionState.SESSION_STARTED ||
        sessionState === cast.framework.SessionState.SESSION_RESUMED
      ) {
        setIsConnected(true);
        const session = context.getCurrentSession();
        setDeviceName(session?.getCastDevice().friendlyName || 'Chromecast');
      } else if (
        sessionState === cast.framework.SessionState.SESSION_ENDED
      ) {
        setIsConnected(false);
        setDeviceName('');
        setIsMediaLoaded(false);
      }
    };

    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, handleSessionState);
    return () => {
      context.removeEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, handleSessionState);
    };
  }, [isAvailable]);

  const castFn = useCallback(() => {
    if (!isAvailable) return;
    const context = cast.framework.CastContext.getInstance();
    context.requestSession().catch(() => {});
  }, [isAvailable]);

  const disconnect = useCallback(() => {
    if (!isAvailable) return;
    const context = cast.framework.CastContext.getInstance();
    context.endCurrentSession(true);
  }, [isAvailable]);

  const loadMedia = useCallback(async (url: string, contentType: string, title?: string) => {
    const context = cast.framework.CastContext.getInstance();
    const session = context.getCurrentSession();
    if (!session) return;

    const mediaInfo = new chrome.cast.media.MediaInfo(url, contentType);
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    if (title) {
      mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title;
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;

    await session.loadMedia(request);
    setIsMediaLoaded(true);
    setIsPaused(false);
  }, []);

  const playOrPause = useCallback(() => {
    controllerRef.current?.playOrPause();
  }, []);

  const seek = useCallback((time: number) => {
    const player = playerRef.current;
    const controller = controllerRef.current;
    if (!player || !controller) return;
    player.currentTime = time;
    controller.seek();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
    setIsMediaLoaded(false);
  }, []);

  return {
    isAvailable,
    isConnected,
    isPaused,
    currentTime,
    duration,
    deviceName,
    isMediaLoaded,
    cast: castFn,
    disconnect,
    loadMedia,
    playOrPause,
    seek,
    stop,
  };
}
