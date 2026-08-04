/**
 * Slideshow index helpers — sequential vs true random.
 * Shared conceptually with mini-program / firmware (no back-to-back repeat).
 */

export function isRandomStrategy(strategy: unknown): boolean {
  return Math.round(Number(strategy)) === 2;
}

/** Next index for random mode; never returns currentIndex when total > 1. */
export function nextRandomIndex(currentIndex: number, total: number): number {
  if (total <= 0) return 0;
  if (total === 1) return 0;
  // Nothing played yet (sentinel) → any photo is valid, including 0.
  if (!Number.isFinite(currentIndex) || currentIndex < 0 || currentIndex >= total) {
    return Math.floor(Math.random() * total);
  }
  let nextIndex = Math.floor(Math.random() * total);
  let guard = 0;
  while (nextIndex === currentIndex && guard++ < 24) {
    nextIndex = Math.floor(Math.random() * total);
  }
  return nextIndex;
}

/** Fisher–Yates shuffle of [0..n). */
export function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Seed "last played" index when creating a slideshow.
 * Sequential: last=n-1 so first tick plays 0 (unless skipPlay already showed 0).
 * Random: last=-1 so first tick picks a true random start (unless skipPlay already showed 0).
 */
export function seedCurrentIndex(opts: {
  strategy: unknown;
  count: number;
  skipPlay: boolean;
}): number {
  const n = Math.max(0, opts.count | 0);
  if (n <= 0) return 0;
  if (isRandomStrategy(opts.strategy)) {
    return opts.skipPlay ? 0 : -1;
  }
  return opts.skipPlay ? 0 : Math.max(0, n - 1);
}

export function nextSlideshowIndex(opts: {
  strategy: unknown;
  currentIndex: number;
  total: number;
}): number {
  const n = opts.total;
  if (n <= 0) return 0;
  if (isRandomStrategy(opts.strategy)) {
    return nextRandomIndex(opts.currentIndex, n);
  }
  const cur = Number(opts.currentIndex);
  const base = Number.isFinite(cur) ? cur : -1;
  return (base + 1 + n * 8) % n;
}
