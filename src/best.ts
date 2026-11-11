/** Best result per level, remembered on this device. */
export interface Best {
  score: number;
  stars: number;
  time: number;
}

const key = (levelId: string) => `ogm.best.${levelId}`;

export function loadBest(levelId: string): Best | null {
  try {
    const b = JSON.parse(localStorage.getItem(key(levelId)) ?? 'null');
    return b && typeof b.score === 'number' ? b : null;
  } catch {
    return null; // storage blocked or corrupt: play on without a record
  }
}

/** Saves the run if it beats the stored one. Returns true for a new best. */
export function saveBest(levelId: string, run: Best): boolean {
  const old = loadBest(levelId);
  if (old && old.score >= run.score) return false;
  try { localStorage.setItem(key(levelId), JSON.stringify(run)); } catch { /* private window: nothing to do */ }
  return true;
}
