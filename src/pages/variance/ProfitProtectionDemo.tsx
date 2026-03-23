// src/pages/variance/ProfitProtectionDemo.tsx
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

import { useProfitProtection } from '@/hooks/useProfitProtection';
import LossLeaderReport from '@/components/variance/LossLeaderReport';
import ActualUsageInput from '@/components/variance/ActualUsageInput';
import { usePosMenu } from '@/hooks/usePosMenu';
import { getOrdersSnapshot, subscribeOrders } from '@/lib/orderStore';
import { getManufacturingRecipesSnapshot, subscribeManufacturingRecipes } from '@/lib/manufacturingRecipeStore';
import { getStockItemsSnapshot, subscribeStockItems } from '@/lib/stockStore';
import type { Ingredient, MenuItem, Sale } from '@/types/variance';

function dateKeyLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function unitFromUnitType(unitType: unknown): Ingredient['unit'] {
  const u = String(unitType ?? '').toUpperCase();
  if (u === 'KG' || u === 'KGS' || u === 'KILOGRAM') return 'kg';
  if (u === 'L' || u === 'LT' || u === 'LITER' || u === 'LITRE') return 'liters';
  return 'each';
}

const ProfitProtectionDemo = () => {
  const pos = usePosMenu();
  const orders = useSyncExternalStore(subscribeOrders, getOrdersSnapshot, getOrdersSnapshot);
  const recipes = useSyncExternalStore(subscribeManufacturingRecipes, getManufacturingRecipesSnapshot, getManufacturingRecipesSnapshot);
  const stockItems = useSyncExternalStore(subscribeStockItems, getStockItemsSnapshot, getStockItemsSnapshot);

  const today = useMemo(() => dateKeyLocal(new Date()), []);
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);

  const { sales, menuItems, ingredients } = useMemo(() => {
    const paidOrders = orders
      .filter((o) => o.status === 'paid')
      .filter((o) => {
        const key = dateKeyLocal(new Date(o.paidAt ?? o.createdAt));
        return key >= startDate && key <= endDate;
      });

    const qtyByMenuItemId = new Map<string, number>();
    for (const o of paidOrders) {
      for (const it of o.items ?? []) {
        if (it.isVoided) continue;
        const id = String(it.menuItemId ?? '').trim();
        if (!id) continue;
        const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
        if (qty <= 0) continue;
        qtyByMenuItemId.set(id, (qtyByMenuItemId.get(id) ?? 0) + qty);
      }
    }

    // Build menuItems + sales from real POS menu + manufacturing recipes.
    const byId = new Map(stockItems.map((s) => [s.id, s] as const));

    const findRecipeForMenu = (menuId: string) => {
      const menu = pos.items.find((m) => m.id === menuId);
      if (!menu) return null;
      const code = String(menu.code ?? '').trim();
      if (code) {
        const byCode = recipes.find((r) => String(r.parentItemCode) === code);
        if (byCode) return { menu, recipe: byCode };
      }
      const byName = recipes.find(
        (r) => String(r.parentItemName).trim().toLowerCase() === String(menu.name).trim().toLowerCase()
      );
      if (byName) return { menu, recipe: byName };
      return null;
    };

    const computedMenuItems: MenuItem[] = [];
    const computedSales: Sale[] = [];
    const ingredientIds = new Set<string>();

    for (const [menuItemId, quantitySold] of qtyByMenuItemId.entries()) {
      const found = findRecipeForMenu(menuItemId);
      if (!found) continue;

      const outputQty = Number.isFinite(found.recipe.outputQty) && found.recipe.outputQty > 0 ? found.recipe.outputQty : 1;
      const components = (found.recipe.ingredients ?? [])
        .map((i) => ({ ingredientId: i.ingredientId, quantity: (Number.isFinite(i.requiredQty) ? i.requiredQty : 0) / outputQty }))
        .filter((c) => c.ingredientId && Number.isFinite(c.quantity) && c.quantity > 0);

      if (!components.length) continue;

      components.forEach((c) => ingredientIds.add(c.ingredientId));
      computedMenuItems.push({ id: found.menu.id, name: found.menu.name, recipe: components });
      computedSales.push({ menuItemId: found.menu.id, quantitySold });
    }

    const computedIngredients: Ingredient[] = Array.from(ingredientIds)
      .map((id) => {
        const s = byId.get(id);
        return {
          id,
          name: s?.name ?? id,
          unit: unitFromUnitType(s?.unitType),
          costPerUnit: Number.isFinite(s?.currentCost) ? (s!.currentCost as number) : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { sales: computedSales, menuItems: computedMenuItems, ingredients: computedIngredients };
  }, [orders, pos.items, recipes, stockItems, startDate, endDate]);

  const {
    theoreticalUsage,
    lossLeaderReport,
    updateActualUsage,
  } = useProfitProtection(sales, menuItems, ingredients);

  return (
    <div className="p-8 space-y-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Profit Protection Module</h1>
        <p className="text-muted-foreground mb-6">
          Comparing theoretical ingredient usage (from paid orders + recipes) vs. manager physical counts.
        </p>

        <div className="flex flex-wrap gap-3 items-end mb-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Start</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">End</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <div className="text-xs text-muted-foreground pb-1">
            Using {sales.length} sold items • {menuItems.length} recipe-mapped menu items • {ingredients.length} ingredients
          </div>
        </div>

        {sales.length === 0 || menuItems.length === 0 || ingredients.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground mb-1">No live variance data yet</div>
            <div>
              This page becomes “real” once you have paid orders and recipes.
              Create a sale in <Link to="/pos/terminal" className="underline">POS Terminal</Link>,
              and ensure recipes exist in <Link to="/app/manufacturing/recipes" className="underline">Manufacturing → Recipes</Link>
              (or use <Link to="/app/inventory/advanced-gaap" className="underline">Mthunzi-Smart</Link> to auto-build a starter recipe).
            </div>
          </div>
        ) : null}

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <ActualUsageInput ingredients={ingredients} onUpdate={updateActualUsage} />
          </div>
          <div className="md:col-span-2">
            <LossLeaderReport report={lossLeaderReport} />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Theoretical Usage (From Paid Orders)</h2>
          <pre className="bg-white p-4 rounded-lg border overflow-auto max-h-[340px]">
            {JSON.stringify(theoreticalUsage, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ProfitProtectionDemo;
