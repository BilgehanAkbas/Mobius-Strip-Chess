/** A finger rather than a mouse: phones and tablets, which also get the lighter graphics. */
export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
