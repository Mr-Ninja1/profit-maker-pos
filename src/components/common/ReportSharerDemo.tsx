// src/components/common/ReportSharerDemo.tsx
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useReportSharer } from '@/hooks/useReportSharer';
import type { DailySalesReport } from '@/types';
import type { Order } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2 } from 'lucide-react';
import { computeDashboardMetrics } from '@/lib/dashboardMetrics';
import { getOrdersSnapshot, subscribeOrders } from '@/lib/orderStore';
import { getGRVsSnapshot, subscribeGRVs, refreshGRVs } from '@/lib/grvDbStore';
import { getExpensesSnapshot, subscribeExpenses } from '@/lib/expenseStore';
import { getStockTakesSnapshot, subscribeStockTakes } from '@/lib/stockTakeStore';
import { useAuth } from '@/contexts/AuthContext';

function dateKeyLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildDailySalesReport(params: { startDate: string; endDate: string; orders: Order[] } & Parameters<typeof computeDashboardMetrics>[0]): DailySalesReport {
  const { overview, topSellers, varianceItems } = computeDashboardMetrics(params);

  const voidAgg = new Map<string, { count: number; value: number }>();
  const paidOrders = params.orders
    .filter((o) => o.status === 'paid')
    .filter((o) => {
      const key = dateKeyLocal(new Date(o.paidAt ?? o.createdAt));
      return key >= params.startDate && key <= params.endDate;
    });

  for (const o of paidOrders) {
    for (const it of o.items ?? []) {
      if (!it.isVoided) continue;
      const reason = (it.voidReason ?? 'Voided').trim() || 'Voided';
      const qty = Number.isFinite(it.quantity) ? it.quantity : 0;
      const unit = Number.isFinite(it.unitPrice) ? it.unitPrice : 0;
      const value = qty * unit;
      const prev = voidAgg.get(reason);
      voidAgg.set(reason, {
        count: (prev?.count ?? 0) + 1,
        value: (prev?.value ?? 0) + value,
      });
    }
  }

  return {
    date: params.endDate,
    totals: {
      netSales: overview.turnoverExcl,
      grossSales: overview.turnoverIncl,
      cogs: overview.costOfSales,
      profit: overview.grossProfit,
      laborCost: 0,
    },
    topSellingItems: topSellers.map((t) => ({ name: t.itemName, quantity: t.quantity, totalSales: t.totalSales })),
    stockVariances: (varianceItems ?? []).slice(0, 10).map((v) => ({
      item: v.itemName,
      theoretical: v.systemQty,
      actual: v.physicalQty,
      uom: v.unitType,
      cost: v.currentCost,
    })),
    voids: Array.from(voidAgg.entries())
      .map(([reason, v]) => ({ reason, count: v.count, value: v.value }))
      .sort((a, b) => b.value - a.value),
  };
}

const ReportSharerDemo = () => {
  const { user, brand, accountUser } = useAuth();
  const { shareDailyReport, formatWhatsAppSummary } = useReportSharer();
  const [isSharing, setIsSharing] = useState(false);

  const orders = useSyncExternalStore(subscribeOrders, getOrdersSnapshot, getOrdersSnapshot);
  const grvs = useSyncExternalStore(subscribeGRVs, getGRVsSnapshot, getGRVsSnapshot);
  const expenses = useSyncExternalStore(subscribeExpenses, getExpensesSnapshot, getExpensesSnapshot);
  const stockTakes = useSyncExternalStore(subscribeStockTakes, getStockTakesSnapshot, getStockTakesSnapshot);

  const brandId = (user?.brand_id ?? brand?.id ?? '') as string;
  useEffect(() => {
    if (!accountUser) return;
    if (!brandId) return;
    void refreshGRVs(brandId).catch((e) => console.error('Failed to load GRVs', e));
  }, [accountUser, brandId]);

  const today = useMemo(() => dateKeyLocal(new Date()), []);
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);

  const report = useMemo(() => {
    return buildDailySalesReport({
      startDate,
      endDate,
      orders,
      grvs,
      expenses,
      stockTakes,
    });
  }, [startDate, endDate, orders, grvs, expenses, stockTakes]);

  const handleShare = async () => {
    setIsSharing(true);
    try {
      await shareDailyReport(report);
    } finally {
      setIsSharing(false);
    }
  };

  const summaryText = formatWhatsAppSummary(report, `approval-${endDate.replace(/-/g, '')}`);

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Daily Report Sharing</CardTitle>
              <div className="text-xs text-muted-foreground">Live data: paid orders, GRVs, expenses, stock takes</div>
            </div>
            <Button onClick={handleShare} disabled={isSharing} size="sm">
              <Share2 className="mr-2 h-4 w-4" />
              {isSharing ? 'Sharing...' : 'Share Report'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
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
                Orders: {orders.length} • GRVs: {grvs.length} • Expenses: {expenses.length} • Stock takes: {stockTakes.length}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">WhatsApp Summary Preview:</p>
              <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm">
                {summaryText}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReportSharerDemo;
