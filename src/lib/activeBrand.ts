let activeBrandId: string | null = null;

const listeners = new Set<() => void>();

export function setActiveBrandId(brandId: string | null) {
  const next = brandId ? String(brandId) : null;
  if (next === activeBrandId) return;
  activeBrandId = next;
  listeners.forEach((l) => l());
}

export function getActiveBrandId(): string | null {
  return activeBrandId;
}

export function subscribeActiveBrandId(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
