export type GameSound = "move" | "capture" | "check" | "end";

// Short synthesized tones, so the game carries no audio files.
const TONES: Record<GameSound, { frequency: number; seconds: number; volume: number; next?: number }> = {
  move: { frequency: 300, seconds: 0.07, volume: 0.16 },
  capture: { frequency: 170, seconds: 0.12, volume: 0.24 },
  check: { frequency: 620, seconds: 0.13, volume: 0.14 },
  end: { frequency: 440, seconds: 0.26, volume: 0.15, next: 660 },
};

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (!context && typeof AudioContext !== "undefined") context = new AudioContext();
  return context;
}

/** Phones only allow sound once the player has touched the page, so this runs on the first touch. */
export function unlockSoundOnFirstTouch(): () => void {
  const unlock = () => void getContext()?.resume();
  window.addEventListener("pointerdown", unlock, { once: true });
  return () => window.removeEventListener("pointerdown", unlock);
}

function tone(audio: AudioContext, frequency: number, start: number, seconds: number, volume: number) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + seconds);
}

export function playSound(sound: GameSound): void {
  try {
    const audio = getContext();
    if (!audio || audio.state !== "running") return;
    const { frequency, seconds, volume, next } = TONES[sound];
    tone(audio, frequency, audio.currentTime, seconds, volume);
    if (next) tone(audio, next, audio.currentTime + seconds * 0.7, seconds, volume);
  } catch {
    // A missing sound never gets in the way of the game.
  }
}
