/**
 * Geometry for the square avatar cropper. Framework-free so it can be tested
 * under vitest's node environment, where there is no DOM.
 *
 * `zoom` is the display factor; `x`/`y` are the image's top-left corner
 * relative to the frame's top-left corner, in displayed pixels, and are
 * therefore never positive once clamped.
 */
export type Size = { readonly width: number; readonly height: number };
export type CropState = { readonly zoom: number; readonly x: number; readonly y: number };
export type SourceRect = {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
};

/** The factor at which the shorter side exactly fills the frame. Below it, gaps appear. */
export function minZoom(natural: Size, frame: number): number {
  return Math.max(frame / natural.width, frame / natural.height);
}

export function clampOffset(state: CropState, natural: Size, frame: number): CropState {
  const zoom = Math.max(state.zoom, minZoom(natural, frame));
  const maxX = natural.width * zoom - frame;
  const maxY = natural.height * zoom - frame;
  return {
    zoom,
    x: Math.min(0, Math.max(-maxX, state.x)),
    y: Math.min(0, Math.max(-maxY, state.y)),
  };
}

/** The frame, expressed in the source image's own pixels — the arguments `drawImage` wants. */
export function sourceRect(state: CropState, natural: Size, frame: number): SourceRect {
  const { zoom, x, y } = clampOffset(state, natural, frame);
  const side = frame / zoom;
  return { sx: -x / zoom, sy: -y / zoom, sw: side, sh: side };
}
