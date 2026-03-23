import { departments as seededDepartments } from '@/data/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

export type CategoryRow = { id: string; name: string };

type CategoriesSnapshot = {
  categories: CategoryRow[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  lastLoadedAt: number | null;
  error: string | null;
};

const STORAGE_KEY = 'pmx.categories.v1';
const listeners = new Set<() => void>();

function safeParse(raw: string | null): CategoriesSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CategoriesSnapshot>;
    if (!Array.isArray(parsed.categories)) return null;
    return {
      categories: parsed.categories.map((c: any) => ({ id: String(c.id), name: String(c.name ?? '') })),
      status: (parsed.status as any) ?? 'idle',
      lastLoadedAt: typeof parsed.lastLoadedAt === 'number' ? parsed.lastLoadedAt : null,
      error: typeof parsed.error === 'string' ? parsed.error : null,
    };
  } catch {
    return null;
  }
}

function loadInitial(): CategoriesSnapshot {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  const fromStorage = safeParse(raw);
  if (fromStorage) return fromStorage;
  return { categories: seededDepartments, status: 'idle', lastLoadedAt: null, error: null };
}

let snapshot: CategoriesSnapshot = loadInitial();
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

export function subscribeCategories(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCategoriesSnapshot() {
  return snapshot;
}

export async function refreshCategories() {
  if (inflight) return inflight;

  inflight = (async () => {
    snapshot = { ...snapshot, status: 'loading', error: null };
    emit();

    try {
      if (isSupabaseConfigured() && supabase) {
        // Note: legacy table name is `departments`, but UX calls them Categories.
        const { data, error } = await supabase.from('departments').select('id,name').order('name', { ascending: true });
        if (error) throw error;
        if (Array.isArray(data)) {
          snapshot = {
            categories: (data as any[]).map((r) => ({ id: String((r as any).id), name: String((r as any).name ?? '') })),
            status: 'ready',
            lastLoadedAt: Date.now(),
            error: null,
          };
          persist();
          emit();
          return;
        }
      }

      // fallback
      snapshot = {
        categories: seededDepartments,
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
        error: e?.message ?? 'Failed to load categories',
      };
      emit();
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function ensureCategoriesLoaded() {
  if (snapshot.status === 'idle') {
    void refreshCategories();
  }
}

export async function addCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('departments').insert({ name: trimmed }).select('id,name').single();
    if (error) throw error;

    const row: CategoryRow = { id: String((data as any).id), name: String((data as any).name ?? trimmed) };
    snapshot = { ...snapshot, categories: [row, ...snapshot.categories] };
    persist();
    emit();
    return;
  }

  const localRow: CategoryRow = { id: `local-${Date.now()}`, name: trimmed };
  snapshot = { ...snapshot, categories: [localRow, ...snapshot.categories] };
  persist();
  emit();
}

export async function updateCategory(id: string, patch: { name: string }) {
  const categoryId = String(id);
  const name = patch.name.trim();
  if (!categoryId || !name) return;

  // Local-only row or offline mode
  if (!isSupabaseConfigured() || !supabase || categoryId.startsWith('local-')) {
    snapshot = {
      ...snapshot,
      categories: snapshot.categories.map((c) => (c.id === categoryId ? { ...c, name } : c)),
    };
    persist();
    emit();
    return;
  }

  const { data, error } = await supabase
    .from('departments')
    .update({ name })
    .eq('id', categoryId)
    .select('id,name')
    .single();
  if (error) throw error;

  snapshot = {
    ...snapshot,
    categories: snapshot.categories.map((c) =>
      c.id === categoryId ? { id: String((data as any).id), name: String((data as any).name ?? name) } : c
    ),
  };
  persist();
  emit();
}

export async function deleteCategory(id: string) {
  const categoryId = String(id);
  if (!categoryId) return;

  if (isSupabaseConfigured() && supabase && !categoryId.startsWith('local-')) {
    const { error } = await supabase.from('departments').delete().eq('id', categoryId);
    if (error) throw error;
  }

  snapshot = { ...snapshot, categories: snapshot.categories.filter((c) => c.id !== categoryId) };
  persist();
  emit();
}
