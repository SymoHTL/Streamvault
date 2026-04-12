/* Google Cast Web Sender SDK type declarations */

declare namespace chrome.cast {
  const isAvailable: boolean;

  enum SessionStatus {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    STOPPED = 'stopped',
  }

  enum ReceiverAvailability {
    AVAILABLE = 'available',
    UNAVAILABLE = 'unavailable',
  }

  namespace media {
    const DEFAULT_MEDIA_RECEIVER_APP_ID: string;

    class MediaInfo {
      constructor(contentId: string, contentType: string);
      contentId: string;
      contentType: string;
      metadata: GenericMediaMetadata | null;
      streamType: StreamType;
    }

    class LoadRequest {
      constructor(mediaInfo: MediaInfo);
      autoplay: boolean;
      currentTime: number;
    }

    class GenericMediaMetadata {
      title: string;
      images: Array<{ url: string }>;
    }

    enum StreamType {
      BUFFERED = 'BUFFERED',
      LIVE = 'LIVE',
      OTHER = 'OTHER',
    }
  }
}

declare namespace cast.framework {
  class CastContext {
    static getInstance(): CastContext;
    setOptions(options: CastOptions): void;
    getCurrentSession(): CastSession | null;
    requestSession(): Promise<void>;
    endCurrentSession(stopCasting: boolean): void;
    addEventListener(
      type: CastContextEventType,
      handler: (event: SessionStateEventData) => void,
    ): void;
    removeEventListener(
      type: CastContextEventType,
      handler: (event: SessionStateEventData) => void,
    ): void;
  }

  class CastSession {
    getSessionId(): string;
    getCastDevice(): { friendlyName: string };
    loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>;
  }

  class RemotePlayer {
    isConnected: boolean;
    isPaused: boolean;
    isMuted: boolean;
    currentTime: number;
    duration: number;
    volumeLevel: number;
    canPause: boolean;
    canSeek: boolean;
    displayName: string;
    isMediaLoaded: boolean;
    playerState: RemotePlayerState;
  }

  class RemotePlayerController {
    constructor(player: RemotePlayer);
    addEventListener(
      type: RemotePlayerEventType,
      handler: (event: RemotePlayerChangedEvent) => void,
    ): void;
    removeEventListener(
      type: RemotePlayerEventType,
      handler: (event: RemotePlayerChangedEvent) => void,
    ): void;
    playOrPause(): void;
    stop(): void;
    muteOrUnmute(): void;
    seek(): void;
    setVolumeLevel(): void;
  }

  interface CastOptions {
    receiverApplicationId: string;
    autoJoinPolicy: AutoJoinPolicy;
  }

  interface SessionStateEventData {
    sessionState: SessionState;
  }

  interface RemotePlayerChangedEvent {
    field: string;
    value: unknown;
  }

  enum CastContextEventType {
    SESSION_STATE_CHANGED = 'sessionstatechanged',
  }

  enum RemotePlayerEventType {
    ANY_CHANGE = 'anyChanged',
    IS_CONNECTED_CHANGED = 'isConnectedChanged',
    IS_PAUSED_CHANGED = 'isPausedChanged',
    CURRENT_TIME_CHANGED = 'currentTimeChanged',
    DURATION_CHANGED = 'durationChanged',
    IS_MEDIA_LOADED_CHANGED = 'isMediaLoadedChanged',
    PLAYER_STATE_CHANGED = 'playerStateChanged',
  }

  enum SessionState {
    NO_SESSION = 'NO_SESSION',
    SESSION_STARTING = 'SESSION_STARTING',
    SESSION_STARTED = 'SESSION_STARTED',
    SESSION_START_FAILED = 'SESSION_START_FAILED',
    SESSION_ENDING = 'SESSION_ENDING',
    SESSION_ENDED = 'SESSION_ENDED',
    SESSION_RESUMED = 'SESSION_RESUMED',
  }

  enum AutoJoinPolicy {
    TAB_AND_ORIGIN_SCOPED = 'tab_and_origin_scoped',
    ORIGIN_SCOPED = 'origin_scoped',
    PAGE_SCOPED = 'page_scoped',
  }

  enum RemotePlayerState {
    IDLE = 'IDLE',
    PLAYING = 'PLAYING',
    PAUSED = 'PAUSED',
    BUFFERING = 'BUFFERING',
  }
}

interface Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
}
