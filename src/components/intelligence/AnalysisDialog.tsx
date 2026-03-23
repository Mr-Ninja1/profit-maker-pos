import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader as THead, TableRow } from '@/components/ui/table';

import type { Insight } from '@/lib/intelligenceInsights';
import type { PurchasePlan } from '@/lib/purchasePlanner';
import type { SupplierPurchaseOrderDraft } from '@/lib/purchasePlanner';
import { purchasePlanToCsv } from '@/lib/purchasePlanner';
import { downloadTextFile } from '@/lib/download';
import { buildMailtoUrl, buildWhatsAppUrlTo, openExternal } from '@/lib/opsLinks';
import { createDraftGRV as createDraftGRVLocal } from '@/lib/grvStore';
import { createDraftGRV as createDraftGRVDb } from '@/lib/grvDbStore';
import type { WeeklyReportData } from '@/lib/opsPdf';
import { downloadPurchasePlanPdf, downloadWeeklyReportPdf } from '@/lib/opsPdf';
import { useAuth } from '@/contexts/AuthContext';

export type AnalysisMetric = {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
};

export type AnalysisRow = {
  label: string;
  value: string;
  hint?: string;
};

export type AnalysisModel = {
  title: string;
  subtitle?: string;
  metrics?: AnalysisMetric[];
  rows?: AnalysisRow[];
  recommendation?: string;
  insights?: Insight[];

  purchasePlan?: {
    plan: PurchasePlan;
    totalCostLabel: string;
    money: (n: number) => string;
  };
  supplierOrders?: SupplierPurchaseOrderDraft[];
  supplierMapping?: {
    total: number;
    assigned: number;
    unassigned: number;
    assignedPct: number;
  };
  weeklyReport?: WeeklyReportData;
  shareLinks?: {
    whatsappUrl: string;
    emailUrl: string;
  };
};

function toneClass(tone: AnalysisMetric['tone']) {
  switch (tone) {
    case 'good':
      return 'bg-green-500/15 text-green-300 border-green-500/30';
    case 'warn':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'bad':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    default:
      return 'bg-white/5 text-purple-200 border-white/10';
  }
}

export function AnalysisDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: AnalysisModel | null;
}) {
  const model = props.model;
  const navigate = useNavigate();
  const { user, brand, accountUser } = useAuth();
  const brandId = (user?.brand_id ?? brand?.id ?? '') as string;

  const insights = model?.insights ?? [];

  const purchasePlan = model?.purchasePlan;
  const supplierOrders = model?.supplierOrders;
  const weeklyReport = model?.weeklyReport;
  const shareLinks = model?.shareLinks;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="p-0 w-screen h-[100dvh] max-w-none max-h-none border-purple-500/25 bg-[#0b0616]/95 text-white backdrop-blur-2xl sm:rounded-none">
        {model ? (
          <div className="h-full w-full flex flex-col">
            {/* Top bar */}
            <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0616]/85 backdrop-blur-xl">
              <div className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-2xl font-bold text-white truncate">{model.title}</div>
                  {model.subtitle ? <div className="text-sm text-purple-200/60">{model.subtitle}</div> : null}
                </div>

                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                      <X className="h-5 w-5" />
                    </Button>
                  </DialogClose>
                </div>
              </div>

              {/* Metrics strip */}
              {model.metrics?.length ? (
                <div className="px-6 pb-4 flex flex-wrap gap-2">
                  {model.metrics.map((m) => (
                    <Badge key={m.label} variant="outline" className={toneClass(m.tone)}>
                      <span className="opacity-80 mr-2">{m.label}</span>
                      <span className="font-bold text-white">{m.value}</span>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 px-6 py-5">
              <Tabs defaultValue="insights" className="h-full flex flex-col">
                <TabsList className="bg-white/5 border border-white/10">
                  <TabsTrigger value="insights">Insights</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="actions">Actions</TabsTrigger>
                </TabsList>

                <TabsContent value="insights" className="flex-1 min-h-0 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {insights.length ? (
                      insights.map((i) => (
                        <div key={i.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-white/90">{i.title}</div>
                              <div className="mt-1 text-sm text-purple-200/70 leading-relaxed">{i.summary}</div>
                            </div>

                            <Badge
                              variant="outline"
                              className={
                                i.tone === 'bad'
                                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                                  : i.tone === 'warn'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : i.tone === 'good'
                                      ? 'bg-green-500/15 text-green-300 border-green-500/30'
                                      : 'bg-white/5 text-purple-200 border-white/10'
                              }
                            >
                              {i.tone.toUpperCase()}
                            </Badge>
                          </div>

                          {i.metrics?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {i.metrics.map((m) => (
                                <Badge key={m.label} variant="outline" className="bg-white/5 text-purple-200 border-white/10">
                                  <span className="opacity-80 mr-2">{m.label}</span>
                                  <span className="font-bold text-white">{m.value}</span>
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          {i.evidence?.length ? (
                            <div className="mt-3">
                              <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Evidence</div>
                              <ul className="mt-2 space-y-1 text-sm text-white/80 list-disc pl-4">
                                {i.evidence.slice(0, 5).map((e, idx) => (
                                  <li key={idx}>{e}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {i.actions?.length ? (
                            <div className="mt-3">
                              <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Next actions</div>
                              <ul className="mt-2 space-y-1 text-sm text-white/80 list-disc pl-4">
                                {i.actions.slice(0, 5).map((a, idx) => (
                                  <li key={idx}>{a}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-purple-200/70">
                        No automated insights available for this view yet.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="details" className="flex-1 min-h-0 mt-4">
                  {model.rows?.length ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                      <Table>
                        <THead>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-purple-200/60">Item</TableHead>
                            <TableHead className="text-purple-200/60">Value</TableHead>
                            <TableHead className="text-purple-200/60">Note</TableHead>
                          </TableRow>
                        </THead>
                        <TableBody>
                          {model.rows.map((r, idx) => (
                            <TableRow key={`${r.label}-${idx}`} className="border-white/10 hover:bg-white/5">
                              <TableCell className="text-white/90 font-medium">{r.label}</TableCell>
                              <TableCell className="text-white">{r.value}</TableCell>
                              <TableCell className="text-purple-200/60 text-xs">{r.hint ?? ''}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-purple-200/70">
                      No detailed rows for this view.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="actions" className="flex-1 min-h-0 mt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-purple-500/20 bg-purple-500/10 p-5">
                      <div className="text-xs uppercase tracking-wider text-purple-200/70 font-bold">Recommendation</div>
                      <div className="mt-2 text-sm text-white/90 leading-relaxed">
                        {model.recommendation ??
                          'Use the Insights tab to identify drivers. Then validate costs, fix loss leaders, and align staffing to peak hours.'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Automation</div>
                      <div className="mt-2 text-sm text-white/80 leading-relaxed">
                        AutoPilot runs on this dashboard data and continuously updates insights as you change filters/date range.
                        Server-side automations (emails/Slack/PO generation) can be added next.
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <Badge variant="outline" className="bg-white/5 text-purple-200 border-white/10">
                          Live
                        </Badge>
                        <Badge variant="outline" className="bg-white/5 text-purple-200 border-white/10">
                          Owner-only
                        </Badge>
                      </div>
                    </div>

                    {purchasePlan ? (
                      <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Auto-generated purchase plan</div>
                            <div className="mt-1 text-sm text-white/90">
                              Horizon: <span className="font-bold">{purchasePlan.plan.horizonDays} days</span> • Lines:{' '}
                              <span className="font-bold">{purchasePlan.plan.totals.lines}</span> • Est:{' '}
                              <span className="font-bold">{purchasePlan.totalCostLabel}</span>
                            </div>
                            {purchasePlan.plan.unmappedSoldItems.length ? (
                              <div className="mt-2 text-xs text-amber-300/80">
                                Some sold items have no recipe mapping (excluded from plan). Add recipes for better accuracy.
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="bg-white/5 border-white/10 hover:bg-white/10"
                              onClick={() => {
                                const csv = purchasePlanToCsv(purchasePlan.plan);
                                downloadTextFile({
                                  filename: `purchase-plan-${purchasePlan.plan.horizonDays}d-${new Date().toISOString().slice(0, 10)}.csv`,
                                  content: csv,
                                  mimeType: 'text/csv;charset=utf-8',
                                });
                              }}
                            >
                              Download CSV
                            </Button>
                            <Button
                              className="bg-white text-purple-950 hover:bg-purple-50 font-bold"
                              onClick={() =>
                                downloadPurchasePlanPdf({
                                  title: 'Purchase Plan',
                                  subtitle: model.subtitle ?? '',
                                  plan: purchasePlan.plan,
                                  formatMoney: purchasePlan.money,
                                })
                              }
                            >
                              Download PDF
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-white/10 overflow-hidden">
                          <div className="max-h-[45vh] overflow-auto">
                            <Table>
                              <THead>
                                <TableRow className="border-white/10 hover:bg-transparent">
                                  <TableHead className="text-purple-200/60">Item</TableHead>
                                  <TableHead className="text-purple-200/60">On Hand</TableHead>
                                  <TableHead className="text-purple-200/60">Forecast</TableHead>
                                  <TableHead className="text-purple-200/60">Suggested</TableHead>
                                  <TableHead className="text-purple-200/60">Est Cost</TableHead>
                                  <TableHead className="text-purple-200/60">Reason</TableHead>
                                </TableRow>
                              </THead>
                              <TableBody>
                                {purchasePlan.plan.rows.slice(0, 50).map((r) => (
                                  <TableRow key={r.itemId} className="border-white/10 hover:bg-white/5">
                                    <TableCell className="text-white/90 font-medium">
                                      {r.name}
                                      <div className="text-[11px] text-purple-200/60">{r.code} • {r.unitType}</div>
                                    </TableCell>
                                    <TableCell className="text-white">{r.onHand}</TableCell>
                                    <TableCell className="text-white">{r.forecastUsage}</TableCell>
                                    <TableCell className="text-white font-bold">{r.suggestedOrderQty}</TableCell>
                                    <TableCell className="text-white">{purchasePlan.money(r.estCost)}</TableCell>
                                    <TableCell className="text-purple-200/70 text-xs">{r.reason}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {supplierOrders?.length ? (
                      <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Supplier purchase orders</div>
                            <div className="mt-1 text-sm text-white/80">
                              Split the plan into supplier-ready requests (WhatsApp/email/PDF/CSV) and optionally create draft GRVs.
                            </div>
                          </div>

                          {supplierOrders.some((s) => s.supplierId === 'unknown') ? (
                            <Button
                              variant="outline"
                              className="bg-white/5 border-white/10 hover:bg-white/10"
                              onClick={() => {
                                props.onOpenChange(false);
                                navigate('/inventory/items?supplier=none');
                              }}
                            >
                              Fix Unassigned Suppliers
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {supplierOrders.map((s) => {
                            const money = purchasePlan?.money ?? ((n: number) => String(n));
                            const canDraft = s.supplierId !== 'unknown';
                            const mapping = model.supplierMapping;
                            const mappingThresholdPct = 95;
                            const mappingOk = !mapping || mapping.assignedPct >= mappingThresholdPct;

                            return (
                              <div key={`${s.supplierId}-${s.supplierName}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-bold text-white/90 truncate">{s.supplierName}</div>
                                    <div className="mt-1 text-xs text-purple-200/60">
                                      Lines: {s.plan.totals.lines} • Est: {money(s.plan.totals.estCost)}
                                    </div>
                                    {s.supplierId === 'unknown' ? (
                                      <div className="mt-2 text-xs text-amber-300/80">
                                        Some items have no supplier mapping. Assign suppliers to stock items or confirm a GRV to learn the last supplier.
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    className="bg-white/5 border-white/10 hover:bg-white/10"
                                    onClick={() => {
                                      const csv = purchasePlanToCsv(s.plan);
                                      downloadTextFile({
                                        filename: `purchase-order-${s.supplierName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
                                        content: csv,
                                        mimeType: 'text/csv;charset=utf-8',
                                      });
                                    }}
                                  >
                                    CSV
                                  </Button>

                                  <Button
                                    variant="outline"
                                    className="bg-white/5 border-white/10 hover:bg-white/10"
                                    onClick={() =>
                                      downloadPurchasePlanPdf({
                                        title: `Purchase Order - ${s.supplierName}`,
                                        subtitle: model.subtitle ?? '',
                                        plan: s.plan,
                                        formatMoney: money,
                                      })
                                    }
                                  >
                                    PDF
                                  </Button>

                                  <Button
                                    variant="outline"
                                    className="bg-white/5 border-white/10 hover:bg-white/10"
                                    disabled={!s.phone}
                                    onClick={() => openExternal(buildWhatsAppUrlTo(s.phone ?? '', s.message))}
                                  >
                                    WhatsApp
                                  </Button>

                                  <Button
                                    variant="outline"
                                    className="bg-white/5 border-white/10 hover:bg-white/10"
                                    disabled={!s.email}
                                    onClick={() =>
                                      openExternal(
                                        buildMailtoUrl({
                                          to: s.email,
                                          subject: `Purchase Order Request - ${s.supplierName}`,
                                          body: s.message,
                                        })
                                      )
                                    }
                                  >
                                    Email
                                  </Button>

                                  <Button
                                    className="bg-white text-purple-950 hover:bg-purple-50 font-bold"
                                    disabled={!canDraft}
                                    onClick={() => {
                                      if (!canDraft) return;

                                      const isUuid = (value: string) =>
                                        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

                                      if (!mappingOk) {
                                        const ok = window.confirm(
                                          `Supplier mapping is ${mapping?.assignedPct.toFixed(0)}% with ${mapping?.unassigned} unassigned items.\n\nDraft GRVs may be incomplete or split incorrectly until mapping is cleaned.\n\nContinue?`
                                        );
                                        if (!ok) return;
                                      }

                                      const items = s.plan.rows.map((r) => {
                                        const quantity = r.suggestedOrderQty;
                                        const unitCost = r.unitCost;
                                        const totalCost = Math.round(quantity * unitCost * 100) / 100;
                                        return {
                                          id: crypto.randomUUID(),
                                          itemId: r.itemId,
                                          itemCode: r.code,
                                          itemName: r.name,
                                          quantity,
                                          unitCost,
                                          totalCost,
                                        };
                                      });

                                      if (accountUser && brandId) {
                                        void createDraftGRVDb({
                                          brandId,
                                          supplierId: isUuid(s.supplierId) ? s.supplierId : '',
                                          supplierName: s.supplierName,
                                          date: new Date().toISOString().slice(0, 10),
                                          paymentType: 'account',
                                          receivedBy: 'System',
                                          applyVat: true,
                                          items,
                                        });
                                        return;
                                      }

                                      createDraftGRVLocal({
                                        supplierId: s.supplierId,
                                        supplierName: s.supplierName,
                                        date: new Date().toISOString().slice(0, 10),
                                        paymentType: 'account',
                                        receivedBy: 'System',
                                        applyVat: true,
                                        items,
                                      });
                                    }}
                                  >
                                    Create Draft GRV
                                  </Button>
                                </div>

                                <div className="mt-3 text-xs text-purple-200/60">
                                  {s.phone ? `Phone: ${s.phone}` : 'Phone: —'} • {s.email ? `Email: ${s.email}` : 'Email: —'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {weeklyReport ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Weekly PDF report</div>
                        <div className="mt-2 text-sm text-white/80 leading-relaxed">
                          One-click owner report with KPIs, top insights, top items, loss leaders, and category mix.
                        </div>
                        <div className="mt-4">
                          <Button className="bg-white text-purple-950 hover:bg-purple-50 font-bold" onClick={() => downloadWeeklyReportPdf(weeklyReport)}>
                            Download Weekly PDF
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {shareLinks ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <div className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">Alerts</div>
                        <div className="mt-2 text-sm text-white/80 leading-relaxed">
                          Sends a ready-to-share message via WhatsApp or email (opens your device app).
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10" onClick={() => openExternal(shareLinks.whatsappUrl)}>
                            Open WhatsApp
                          </Button>
                          <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10" onClick={() => openExternal(shareLinks.emailUrl)}>
                            Compose Email
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
