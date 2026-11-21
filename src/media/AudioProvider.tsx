import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AudioPlayer } from "./audio-player.ts";
import type { AudioService } from "./audio-service.ts";

const AudioServiceContext = createContext<AudioService | null>(null);

/**
 * Gives the slides inside one shared audio player, created on first render
 * and released when the provider unmounts. The session player wraps each
 * session in one.
 */
export function AudioProvider({ children }: { readonly children: ReactNode }) {
  const [audio] = useState(() => new AudioPlayer());
  useEffect(
    () => () => {
      audio.dispose();
    },
    [audio],
  );
  return <AudioServiceContext value={audio}>{children}</AudioServiceContext>;
}

/** The audio service for the current session. */
export function useAudio(): AudioService {
  const audio = use(AudioServiceContext);
  if (audio === null) {
    throw new Error("useAudio() must be used inside an <AudioProvider>");
  }
  return audio;
}
