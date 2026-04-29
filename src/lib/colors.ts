// Lily's outfit colour palette: hot-pink jacket, yellow trousers, blue boots, purple gloves, flame-orange helmet
export const LILY_PALETTE = ['#ff69b4', '#ffcc00', '#4499ff', '#cc66ff', '#ff8800'];

// Running index — advances each call so consecutive text objects get the next palette colour.
// Call resetColors() at the top of each scene's create() for consistent ordering.
let _idx = 0;

export function nextColor(): string {
  return LILY_PALETTE[(_idx++) % LILY_PALETTE.length];
}

export function resetColors(): void {
  _idx = 0;
}
