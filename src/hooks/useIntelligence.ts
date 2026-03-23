import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { GRV, Expense, StockItem, Recipe } from '@/types';
import type { Order } from '@/types/pos';
import { subscribeOrders, getOrdersSnapshot } from '@/lib/orderStore';
import { subscribeGRVs, getGRVsSnapshot, refreshGRVs } from '@/lib/grvDbStore';
import { subscribeExpenses, getExpensesSnapshot } from '@/lib/expenseStore';
import { subscribeStockItems, getStockItemsSnapshot } from '@/lib/stockStore';
import { subscribeManufacturingRecipes, getManufacturingRecipesSnapshot } from '@/lib/manufacturingRecipeStore';
import { usePosMenu } from '@/hooks/usePosMenu';
import { cleanOrdersForIntelligence } from '@/lib/intelligence/cleanRestaurantData';
import { useAuth } from '@/contexts/AuthContext';

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

function dateKeyLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export type IntelligenceRange = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

export type MoneyFlowSankey = {
  nodes: Array<{ name: string }>;
  links: Array<{ source: number; target: number; value: number }>;
};

export type MenuEngineeringPoint = {
  key: string;
  name: string;
  qty: number;
  sales: number;
  profit: number;
  profitPerItem: number;
  quadrant: 'Star' | 'Plowhorse' | 'Puzzle' | 'Dog';
  priceUpsidePct: number;
};

export type GoldenHourCell = {
  dow: number; // 0=Sun
  hour: number; // 0-23
  value: number; // turnover
  tickets: number;
};

export type StaffEfficiencyRow = {
  staffId: string;
  staffName: string;
  tickets: number;
  sales: number;
  grossProfit: number;
  gpPercent: number;
  avgTicket: number;
};

export type IntelligenceShiftFilter = 'all' | 'morning' | 'evening';

export type IntelligenceFilters = {
  shift?: IntelligenceShiftFilter;
  categoryIds?: string[];
  minGpPercent?: number;
};

export function useIntelligence(range: IntelligenceRange, filters?: IntelligenceFilters) {
  const { user, brand, accountUser } = useAuth();
  const orders = useSyncExternalStore(subscribeOrders, getOrdersSnapshot, getOrdersSnapshot);
  const grvs = useSyncExternalStore(subscribeGRVs, getGRVsSnapshot, getGRVsSnapshot);
  const expenses = useSyncExternalStore(subscribeExpenses, getExpensesSnapshot, getExpensesSnapshot);
  const stockItems = useSyncExternalStore(subscribeStockItems, getStockItemsSnapshot, getStockItemsSnapshot);
  const recipes = useSyncExternalStore(subscribeManufacturingRecipes, getManufacturingRecipesSnapshot, getManufacturingRecipesSnapshot);
  const pos = usePosMenu();

  const brandId = (user?.brand_id ?? brand?.id ?? '') as string;
  useEffect(() => {
    if (!accountUser) return;
    if (!brandId) return;
    void refreshGRVs(brandId).catch((e) => console.error('Failed to load GRVs', e));
  }, [accountUser, brandId]);

  const [lastDataAt, setLastDataAt] = useState<number>(() => Date.now());
  const [livePulse, setLivePulse] = useState(false);

  useEffect(() => {
    setLastDataAt(Date.now());
    setLivePulse(true);
    const t = window.setTimeout(() => setLivePulse(false), 700);
    return () => window.clearTimeout(t);
  }, [orders.length]);

  const safeStart = range.startDate <= range.endDate ? range.startDate : range.endDate;
  const safeEnd = range.startDate <= range.endDate ? range.endDate : range.startDate;

  const shift = filters?.shift ?? 'all';
  const categoryIds = filters?.categoryIds ?? [];
  const minGpPercent = Number.isFinite(filters?.minGpPercent) ? (filters?.minGpPercent ?? 0) : 0;

  const basePaidOrdersInRange = useMemo(() => {
    const cleaned = cleanOrdersForIntelligence(orders, { includeStatuses: ['paid'] });
    return cleaned.filter((o) => {
      const key = dateKeyLocal(new Date(o.paidAt ?? o.createdAt));
      return key >= safeStart && key <= safeEnd;
    });
  }, [orders, safeStart, safeEnd]);

  const paidOrdersInRange = useMemo(() => {
    let out = basePaidOrdersInRange;

    if (shift !== 'all') {
      out = out.filter((o) => {
        const dt = new Date(o.paidAt ?? o.createdAt);
        const hour = dt.getHours();
        const isEvening = hour >= 15; // 15:00+ considered evening shift
        return shift === 'evening' ? isEvening : !isEvening;
      });
    }

    if (categoryIds.length) {
      const allowed = new Set(categoryIds);
      const posItemsMap = new Map(pos.items.map((i) => [i.id, i] as const));

      const filtered: Order[] = [];
      for (const o of out) {
        const items = (o.items ?? []).filter((it) => {
          if (!it.menuItemId) return false;
          const itemDef = posItemsMap.get(it.menuItemId);
          const catId = itemDef?.categoryId;
          return Boolean(catId && allowed.has(catId));
        });

        if (!items.length) continue;

        const total = round2(
          sum(
            items.map((it) => {
              const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
              const unitPrice = Number.isFinite(it.unitPrice) ? it.unitPrice : 0;
              return Number.isFinite(it.total) ? it.total : qty * unitPrice;
            })
          )
        );

        const totalCost = round2(
          sum(
            items.map((it) => {
              const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
              const unitCost = Number.isFinite(it.unitCost) ? it.unitCost : 0;
              return qty * unitCost;
            })
          )
        );

        filtered.push({ ...o, items, total, totalCost });
      }

      out = filtered;
    }

    return out;
  }, [basePaidOrdersInRange, shift, categoryIds, pos.items]);

  const expenseTotal = useMemo(() => {
    return round2(
      sum(
        (expenses ?? [])
          .filter((e) => e.date >= safeStart && e.date <= safeEnd)
          .map((e) => (Number.isFinite(e.amount) ? e.amount : 0))
      )
    );
  }, [expenses, safeStart, safeEnd]);

  const kpis = useMemo(() => {
    const turnover = round2(sum(paidOrdersInRange.map((o) => (Number.isFinite(o.total) ? o.total : 0))));
    const cost = round2(sum(paidOrdersInRange.map((o) => (Number.isFinite(o.totalCost) ? o.totalCost : 0))));
    const grossProfit = round2(turnover - cost);
    const gpPercent = turnover > 0 ? round2((grossProfit / turnover) * 100) : 0;
    const tickets = paidOrdersInRange.length;
    const avgTicket = tickets > 0 ? round2(turnover / tickets) : 0;

    return { turnover, cost, grossProfit, gpPercent, tickets, avgTicket, expenses: expenseTotal, netProfit: round2(grossProfit - expenseTotal) };
  }, [paidOrdersInRange, expenseTotal]);

  const paymentTotals = useMemo(() => {
    const totals = { cash: 0, card: 0, cheque: 0, account: 0, non_bank: 0 };
    for (const o of paidOrdersInRange) {
      const splits = o.splitPayments?.filter((s) => Number.isFinite(s.amount) && s.amount > 0) ?? [];
      if (splits.length) {
        for (const s of splits) {
          if (s.method in totals) (totals as any)[s.method] += s.amount;
        }
        continue;
      }
      const method = (o.paymentMethod ?? 'cash') as keyof typeof totals;
      const amt = Number.isFinite(o.total) ? o.total : 0;
      if (method in totals) (totals as any)[method] += amt;
    }
    return {
      cash: round2(totals.cash),
      card: round2(totals.card),
      cheque: round2(totals.cheque),
      account: round2(totals.account),
      non_bank: round2(totals.non_bank),
    };
  }, [paidOrdersInRange]);

  const sankey = useMemo<MoneyFlowSankey>(() => {
    const sales = Math.max(0, kpis.turnover);
    const cost = Math.max(0, kpis.cost);
    const gp = Math.max(0, kpis.grossProfit);
    const exp = Math.max(0, kpis.expenses);

    const nodes = [{ name: 'Sales' }, { name: 'Cost of Sales' }, { name: 'Gross Profit' }, { name: 'Expenses' }, { name: 'Net Profit/Loss' }];

    // Push flow through GP then through expenses.
    const links = [
      { source: 0, target: 1, value: cost },
      { source: 0, target: 2, value: gp },
      { source: 2, target: 3, value: Math.min(gp, exp) },
      { source: 2, target: 4, value: Math.max(0, gp - exp) },
      { source: 3, target: 4, value: Math.max(0, exp - gp) },
    ].filter((l) => l.value > 0.0001);

    return { nodes, links };
  }, [kpis]);

  const menuEngineering = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; sales: number; cost: number }>();

    for (const o of paidOrdersInRange) {
      for (const it of o.items ?? []) {
        const key = it.menuItemCode || it.menuItemId;
        if (!key) continue;

        const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
        const sales = Number.isFinite(it.total) ? it.total : qty * (Number.isFinite(it.unitPrice) ? it.unitPrice : 0);
        const cost = qty * (Number.isFinite(it.unitCost) ? it.unitCost : 0);

        const prev = map.get(key);
        if (!prev) map.set(key, { name: it.menuItemName ?? key, qty, sales, cost });
        else map.set(key, { name: prev.name, qty: prev.qty + qty, sales: prev.sales + sales, cost: prev.cost + cost });
      }
    }

    const rows = [...map.entries()].map(([key, v]) => {
      const profit = v.sales - v.cost;
      const profitPerItem = v.qty > 0 ? profit / v.qty : 0;
      return {
        key,
        name: v.name,
        qty: round2(v.qty),
        sales: round2(v.sales),
        profit: round2(profit),
        profitPerItem: round2(profitPerItem),
      };
    });

    const avgQty = rows.length ? sum(rows.map((r) => r.qty)) / rows.length : 0;
    const avgPpi = rows.length ? sum(rows.map((r) => r.profitPerItem)) / rows.length : 0;

    let points: MenuEngineeringPoint[] = rows
      .map((r) => {
        const hiQty = r.qty >= avgQty;
        const hiPpi = r.profitPerItem >= avgPpi;
        const quadrant: MenuEngineeringPoint['quadrant'] = hiQty && hiPpi ? 'Star' : hiQty && !hiPpi ? 'Plowhorse' : !hiQty && hiPpi ? 'Puzzle' : 'Dog';

        // Simple coach suggestion: if it's a star/puzzle, estimate a safe price upside.
        const suggested = quadrant === 'Star' || quadrant === 'Puzzle' ? 5 : quadrant === 'Plowhorse' ? 2 : 0;

        return {
          key: r.key,
          name: r.name,
          qty: r.qty,
          sales: r.sales,
          profit: r.profit,
          profitPerItem: r.profitPerItem,
          quadrant,
          priceUpsidePct: suggested,
        };
      })
      .sort((a, b) => b.sales - a.sales);

    if (minGpPercent > 0) {
      points = points.filter((p) => {
        if (p.sales <= 0) return false;
        const gpPct = (p.profit / p.sales) * 100;
        return gpPct >= minGpPercent;
      });
    }

    return { points, avgQty: round2(avgQty), avgProfitPerItem: round2(avgPpi) };
  }, [paidOrdersInRange, minGpPercent]);

  const goldenHour = useMemo(() => {
    const cellMap = new Map<string, { value: number; tickets: number }>();

    for (const o of paidOrdersInRange) {
      const dt = new Date(o.paidAt ?? o.createdAt);
      const dow = dt.getDay();
      const hour = dt.getHours();
      const key = `${dow}-${hour}`;
      const prev = cellMap.get(key) ?? { value: 0, tickets: 0 };
      const value = prev.value + (Number.isFinite(o.total) ? o.total : 0);
      cellMap.set(key, { value, tickets: prev.tickets + 1 });
    }

    const cells: GoldenHourCell[] = [];
    let max = 0;
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${dow}-${hour}`;
        const v = cellMap.get(key) ?? { value: 0, tickets: 0 };
        const value = round2(v.value);
        max = Math.max(max, value);
        cells.push({ dow, hour, value, tickets: v.tickets });
      }
    }

    return { cells, max: round2(max) };
  }, [paidOrdersInRange]);

  const staffEfficiency = useMemo(() => {
    const map = new Map<string, { name: string; tickets: number; sales: number; cost: number }>();

    for (const o of paidOrdersInRange) {
      const id = o.staffId || 'unknown';
      const prev = map.get(id) ?? { name: o.staffName ?? 'Unknown', tickets: 0, sales: 0, cost: 0 };
      map.set(id, {
        name: prev.name,
        tickets: prev.tickets + 1,
        sales: prev.sales + (Number.isFinite(o.total) ? o.total : 0),
        cost: prev.cost + (Number.isFinite(o.totalCost) ? o.totalCost : 0),
      });
    }

    const rows: StaffEfficiencyRow[] = [...map.entries()]
      .map(([staffId, v]) => {
        const gp = v.sales - v.cost;
        const avgTicket = v.tickets > 0 ? v.sales / v.tickets : 0;
        const gpPercent = v.sales > 0 ? (gp / v.sales) * 100 : 0;
        return {
          staffId,
          staffName: v.name,
          tickets: v.tickets,
          sales: round2(v.sales),
          grossProfit: round2(gp),
          gpPercent: round2(gpPercent),
          avgTicket: round2(avgTicket),
        };
      })
      .sort((a, b) => b.sales - a.sales);

    return rows;
  }, [paidOrdersInRange]);

  const wacByItemId = useMemo(() => {
    // 90-day lookback weighted average cost per unit
    const lookbackDays = 90;
    const end = new Date(`${safeEnd}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - lookbackDays);

    const acc = new Map<string, { qty: number; value: number }>();
    for (const g of grvs ?? []) {
      if (g.status !== 'confirmed') continue;
      if (!g.date) continue;
      const gd = new Date(`${g.date}T00:00:00`);
      if (gd < start || gd > end) continue;
      for (const it of g.items ?? []) {
        const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
        const value = qty * (Number.isFinite(it.unitCost) ? it.unitCost : 0);
        if (!it.itemId || qty <= 0) continue;
        const prev = acc.get(it.itemId) ?? { qty: 0, value: 0 };
        acc.set(it.itemId, { qty: prev.qty + qty, value: prev.value + value });
      }
    }

    const out = new Map<string, number>();
    for (const [itemId, v] of acc.entries()) {
      if (v.qty <= 0) continue;
      out.set(itemId, round2(v.value / v.qty));
    }
    return out;
  }, [grvs, safeEnd]);

  const salesByCategory = useMemo(() => {
    const catMap = new Map<string, number>();
    const posItemsMap = new Map(pos.items.map((i) => [i.id, i]));
    const posCatsMap = new Map(pos.categories.map((c) => [c.id, c]));

    for (const o of paidOrdersInRange) {
      for (const it of o.items ?? []) {
        // Try to find category
        const itemDef = posItemsMap.get(it.menuItemId);
        let catName = 'Uncategorized';
        if (itemDef) {
          const cat = posCatsMap.get(itemDef.categoryId);
          if (cat) catName = cat.name;
        }

        const val = Number.isFinite(it.total) ? it.total : 0;
        catMap.set(catName, (catMap.get(catName) ?? 0) + val);
      }
    }

    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value);
  }, [paidOrdersInRange, pos.items, pos.categories]);

  const salesByOrderType = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of paidOrdersInRange) {
      const type = o.orderType || 'unknown';
      const val = Number.isFinite(o.total) ? o.total : 0;
      map.set(type, (map.get(type) ?? 0) + val);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name: name.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        value: round2(value),
      }))
      .sort((a, b) => b.value - a.value);
  }, [paidOrdersInRange]);

  const profitByDate = useMemo(() => {
    const map = new Map<string, { date: string; profit: number; sales: number }>();

    for (const o of paidOrdersInRange) {
      const key = dateKeyLocal(new Date(o.paidAt ?? o.createdAt));
      const sales = Number.isFinite(o.total) ? o.total : 0;
      const cost = Number.isFinite(o.totalCost) ? o.totalCost : 0;
      const gp = sales - cost;

      const prev = map.get(key) ?? { date: key, profit: 0, sales: 0 };
      map.set(key, { date: key, profit: prev.profit + gp, sales: prev.sales + sales });
    }

    return Array.from(map.values())
      .map((d) => ({ ...d, profit: round2(d.profit), sales: round2(d.sales) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [paidOrdersInRange]);

  const supplierMapping = useMemo(() => {
    const total = stockItems.length;
    const unassigned = stockItems.reduce((acc, s) => (s.supplierId ? acc : acc + 1), 0);
    const assigned = Math.max(0, total - unassigned);
    const assignedPct = total > 0 ? round2((assigned / total) * 100) : 100;
    return {
      total,
      assigned,
      unassigned,
      assignedPct,
    };
  }, [stockItems]);

  return {
    range: { startDate: safeStart, endDate: safeEnd },
    lastDataAt,
    livePulse,

    allOrders: orders,
    orders: paidOrdersInRange,
    grvs,
    expenses,
    stockItems,
    recipes,
    pos,

    kpis,
    paymentTotals,
    sankey,
    menuEngineering,
    goldenHour,
    staffEfficiency,
    wacByItemId,
    salesByCategory,
    salesByOrderType,
    profitByDate,

    supplierMapping,
  };
}

export type UseIntelligenceReturn = ReturnType<typeof useIntelligence>;
