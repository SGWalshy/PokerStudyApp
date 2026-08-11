// Races a promise against a timeout so a hung native call (e.g. an
// image-capture bridge call that never resolves or rejects) can't leave the
// UI stuck forever — it surfaces as a normal catchable error instead.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
