/** What a playback reports back to whoever started it. */
export type PlaybackEvent = "playing" | "ended" | "failed";

/** One clip that was started. Stopping it does nothing once it is no longer current. */
export interface Playback {
  readonly stop: () => void;
}

/**
 * Plays sound clips, one at a time. Slides use this interface through
 * useAudio() and never touch audio elements themselves.
 */
export interface AudioService {
  /**
   * Stops whatever is playing and starts this clip. onEvent hears only
   * about this clip, and only while it is the current one.
   */
  play(src: string, onEvent: (event: PlaybackEvent) => void): Playback;
  /** Stops the current clip, if any, and releases its audio element. */
  stop(): void;
  /** Releases everything. The service can still be used afterwards. */
  dispose(): void;
}
