import { supabase } from "./supabaseClient";
import { offlineVault } from "./offlineVault";
import { getActiveBrandId } from "./activeBrand";

export async function deleteItem(table: string, id: string) {
  // Try Supabase first
  if (supabase) {
    const brandId = getActiveBrandId();
    const q = supabase.from(table).delete().eq("id", id);
    const { error } = brandId ? await (q as any).eq('brand_id', brandId) : await q;
    if (!error) return true;
  }
  // Fallback: Dexie
  if (offlineVault && offlineVault[table]) {
    await offlineVault[table].delete(id);
    return true;
  }
  return false;
}
