import { suppliers as seededSuppliers } from '@/data/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export type SupplierRow = { id: string; name: string; code?: string };

type SuppliersSnapshot = {
  suppliers: SupplierRow[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  lastLoadedAt: number | null;
  error: string | null;
};

const STORAGE_KEY = 'pmx.suppliers.v1';
const listeners = new Set<() => void>();

function safeParse(raw: string | null): SuppliersSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SuppliersSnapshot>;
    if (!Array.isArray(parsed.suppliers)) return null;
    return {
      suppliers: parsed.suppliers.map((s: any) => ({
        id: String(s.id),
        name: String(s.name ?? ''),
        code: s.code ? String(s.code) : undefined,
      })),
      status: (parsed.status as any) ?? 'idle',
      lastLoadedAt: typeof parsed.lastLoadedAt === 'number' ? parsed.lastLoadedAt : null,
      error: typeof parsed.error === 'string' ? parsed.error : null,
    };
  } catch {
    return null;
  }
}

function loadInitial(): SuppliersSnapshot {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  const fromStorage = safeParse(raw);
  if (fromStorage) return fromStorage;
  return {
    suppliers: (seededSuppliers ?? []).map((s) => ({ id: String((s as any).id), name: String((s as any).name ?? ''), code: (s as any).code ?? undefined })),
    status: 'idle',
    lastLoadedAt: null,
    error: null,
  };
}

let snapshot: SuppliersSnapshot = loadInitial();
let inflight: Promise<void> | null = null;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeSuppliers(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSuppliersSnapshot() {
  return snapshot;
}

export async function refreshSuppliers() {
  if (inflight) return inflight;

  inflight = (async () => {
    snapshot = { ...snapshot, status: 'loading', error: null };
    emit();

    try {
      if (isSupabaseConfigured() && supabase) {
        const { data, error } = await supabase.from('suppliers').select('id,name,code').order('name', { ascending: true });
        if (error) throw error;
        if (Array.isArray(data)) {
          snapshot = {
            suppliers: (data as any[]).map((r) => ({
              id: String((r as any).id),
              name: String((r as any).name ?? ''),
              code: (r as any).code ? String((r as any).code) : undefined,
            })),
            status: 'ready',
            lastLoadedAt: Date.now(),
            error: null,
          };
          persist();
          emit();
          return;
        }
      }

      snapshot = {
        suppliers: (seededSuppliers ?? []).map((s) => ({ id: String((s as any).id), name: String((s as any).name ?? ''), code: (s as any).code ?? undefined })),
        status: 'ready',
        lastLoadedAt: Date.now(),
        error: null,
      };
      persist();
      emit();
    } catch (e: any) {
      snapshot = {
        ...snapshot,
        status: 'error',
        lastLoadedAt: snapshot.lastLoadedAt ?? null,
        error: e?.message ?? 'Failed to load suppliers',
      };
      emit();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function ensureSuppliersLoaded() {
  if (snapshot.status === 'idle') {
    void refreshSuppliers();
  }
}

export async function addSupplier(input: { name: string; code?: string }) {
  const name = input.name.trim();
  const code = input.code?.trim() || undefined;
  if (!name) return;

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('suppliers').insert({ name, code }).select('id,name,code').single();
    if (error) throw error;

    const row: SupplierRow = {
      id: String((data as any).id),
      name: String((data as any).name ?? name),
      code: (data as any).code ? String((data as any).code) : undefined,
    };

    snapshot = { ...snapshot, suppliers: [row, ...snapshot.suppliers] };
    persist();
    emit();
    return;
  }

  const localRow: SupplierRow = { id: `local-${Date.now()}`, name, code };
  snapshot = { ...snapshot, suppliers: [localRow, ...snapshot.suppliers] };
  persist();
  emit();
}

export async function updateSupplier(id: string, patch: { name?: string; code?: string | null | undefined }) {
  const supplierId = String(id);
  const name = patch.name != null ? patch.name.trim() : undefined;
  const code = patch.code != null ? String(patch.code).trim() : undefined;

  if (!supplierId) return;

  // Local-only row or offline mode
  if (!isSupabaseConfigured() || !supabase || supplierId.startsWith('local-')) {
    snapshot = {
      ...snapshot,
      suppliers: snapshot.suppliers.map((s) =>
        s.id === supplierId
          ? {
              ...s,
              ...(name != null ? { name } : {}),
              ...(patch.code !== undefined ? { code: code || undefined } : {}),
            }
          : s
      ),
    };
    persist();
    emit();
    return;
  }

  const updateRow: any = {};
  if (name != null) updateRow.name = name;
  if (patch.code !== undefined) updateRow.code = code || null;
  if (Object.keys(updateRow).length === 0) return;

  const { data, error } = await supabase
    .from('suppliers')
    .update(updateRow)
    .eq('id', supplierId)
    .select('id,name,code')
    .single();
  if (error) throw error;

  snapshot = {
    ...snapshot,
    suppliers: snapshot.suppliers.map((s) =>
      s.id === supplierId
        ? {
            id: String((data as any).id),
            name: String((data as any).name ?? name ?? s.name),
            code: (data as any).code ? String((data as any).code) : undefined,
          }
        : s
    ),
  };
  persist();
  emit();
}

export async function deleteSupplier(id: string) {
  const supplierId = String(id);
  if (!supplierId) return;

  if (isSupabaseConfigured() && supabase && !supplierId.startsWith('local-')) {
    const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
    if (error) throw error;
  }

  snapshot = { ...snapshot, suppliers: snapshot.suppliers.filter((s) => s.id !== supplierId) };
  persist();
  emit();
}
