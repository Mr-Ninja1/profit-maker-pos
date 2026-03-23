import { useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Calendar, Check, ChevronsUpDown, Plus, Search } from 'lucide-react';

import { PageHeader, DataTableWrapper, NumericCell } from '@/components/common/PageComponents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';

import type { StockItem } from '@/types';
import { getStockItemsSnapshot, subscribeStockItems } from '@/lib/stockStore';
import {
  createStockIssue,
  getStockIssuesSnapshot,
  StockIssueError,
  subscribeStockIssues,
} from '@/lib/stockIssueStore';
import { cn } from '@/lib/utils';

type DraftIssueLine = {
  id: string;
  originItemId: string;
  destinationItemId: string;
  qty: string;
};

function StockItemPicker(props: {
  value: string;
  onChange: (id: string) => void;
  items: StockItem[];
  placeholder: string;
  disabled?: boolean;
}) {
  const selected = props.items.find((i) => i.id === props.value) ?? null;
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', !selected && 'text-muted-foreground')}
          disabled={props.disabled}
        >
          {selected ? `${selected.code} - ${selected.name} (Stock: ${selected.currentStock})` : props.placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type code or name..." />
          <CommandList>
            <CommandEmpty>No item found.</CommandEmpty>
            <CommandGroup>
              {props.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.code} ${item.name}`}
                  onSelect={() => {
                    props.onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', props.value === item.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{item.code} - {item.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Stock: {item.currentStock}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function dateKeyLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function StockIssues() {
  const stockItems = useSyncExternalStore(subscribeStockItems, getStockItemsSnapshot);
  const issues = useSyncExternalStore(subscribeStockIssues, getStockIssuesSnapshot);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [issueDate, setIssueDate] = useState<string>(dateKeyLocal(new Date()));
  const [createdBy, setCreatedBy] = useState('System');
  const [search, setSearch] = useState('');

  const [draftLines, setDraftLines] = useState<DraftIssueLine[]>(() => [
    { id: `dl-${crypto.randomUUID()}`, originItemId: '', destinationItemId: '', qty: '' },
  ]);

  const storeItems = useMemo(() => {
    const store = stockItems.filter((s) => String(s.code).startsWith('4'));
    return store.length ? store : stockItems;
  }, [stockItems]);

  const departmentItems = useMemo(() => {
    const dept = stockItems.filter((s) => !String(s.code).startsWith('4'));
    return dept.length ? dept : stockItems;
  }, [stockItems]);

  const validated = useMemo(() => {
    const eps = 1e-9;
    const lines = draftLines.map((l) => {
      const origin = stockItems.find((s) => s.id === l.originItemId) ?? null;
      const dest = stockItems.find((s) => s.id === l.destinationItemId) ?? null;
      const qtyRaw = Number(l.qty);
      const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      const touched = Boolean(l.originItemId || l.destinationItemId || (l.qty && l.qty.trim()));

      const errors: string[] = [];
      if (touched) {
        if (!origin) errors.push('Select an origin item.');
        if (!dest) errors.push('Select a destination item.');
        if (!(qty > 0)) errors.push('Enter an issue quantity > 0.');
        if (origin && dest && origin.id === dest.id) errors.push('Origin and destination cannot be the same item.');
        if (origin && dest && origin.unitType !== dest.unitType) errors.push(`Unit mismatch: ${origin.unitType} → ${dest.unitType}.`);
        if (origin) {
          const onHand = Number.isFinite(origin.currentStock) ? origin.currentStock : 0;
          if (qty > onHand + eps) errors.push(`Insufficient stock (on hand: ${onHand}).`);
        }
      }

      const ok = touched ? errors.length === 0 : false;
      return { ...l, origin, dest, qty, touched, ok, errors };
    });

    const validLines = lines.filter((l) => l.ok);
    const invalidTouchedLines = lines.filter((l) => l.touched && !l.ok);
    const totalValue = validLines.reduce((sum, l) => {
      const unitCost = l.origin && Number.isFinite(l.origin.currentCost) ? l.origin.currentCost : 0;
      return sum + l.qty * unitCost;
    }, 0);

    return {
      lines,
      validLines,
      invalidTouchedLines,
      totalValue,
      canConfirm: validLines.length > 0 && invalidTouchedLines.length === 0,
    };
  }, [draftLines, stockItems]);

  const issueGroups = useMemo(() => {
    const grouped = new Map<
      number,
      { issueNo: number; date: string; createdBy: string; items: typeof issues; totalValue: number }
    >();

    for (const issue of issues) {
      const existing = grouped.get(issue.issueNo) ?? {
        issueNo: issue.issueNo,
        date: issue.date,
        createdBy: issue.createdBy,
        items: [],
        totalValue: 0,
      };
      existing.items = [...existing.items, issue];
      existing.totalValue = (existing.totalValue ?? 0) + (Number.isFinite(issue.value) ? issue.value : 0);
      grouped.set(issue.issueNo, existing);
    }

    const all = Array.from(grouped.values()).sort((a, b) => b.issueNo - a.issueNo);
    const q = search.trim().toLowerCase();
    if (!q) return all;

    return all.filter((g) => {
      if (String(g.issueNo).includes(q)) return true;
      if (String(g.createdBy).toLowerCase().includes(q)) return true;
      if (String(g.date).toLowerCase().includes(q)) return true;
      return g.items.some((it) =>
        `${it.originItemCode} ${it.destinationItemCode}`.toLowerCase().includes(q)
      );
    });
  }, [issues, search]);

  function resetDialog() {
    setDraftLines([{ id: `dl-${crypto.randomUUID()}`, originItemId: '', destinationItemId: '', qty: '' }]);
    setCreatedBy('System');
    setIssueDate(dateKeyLocal(new Date()));
  }

  function addLine() {
    setDraftLines((prev) => [...prev, { id: `dl-${crypto.randomUUID()}`, originItemId: '', destinationItemId: '', qty: '' }]);
  }

  function removeLine(id: string) {
    setDraftLines((prev) => prev.filter((l) => l.id !== id));
  }

  function confirmIssue() {
    if (!validated.canConfirm) return;

    try {
      const res = createStockIssue({
        date: issueDate,
        createdBy: createdBy.trim() || 'System',
        lines: validated.validLines.map((l) => ({ originItemId: l.originItemId, destinationItemId: l.destinationItemId, qty: l.qty })),
      });

      toast({ title: 'Stock issued', description: `Issue #${res.issueNo} saved and stock updated.` });
      setIsAddDialogOpen(false);
      resetDialog();
    } catch (e) {
      const msg =
        e instanceof StockIssueError
          ? e.message
          : (e as Error)?.message ?? 'Failed to create issue.';
      toast({ title: 'Cannot issue stock', description: msg, variant: 'destructive' });
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock Issues"
        description="Record internal stock transfers from Main Store to Departments"
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Issue
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create Stock Issue</DialogTitle>
                <DialogDescription>Transfer stock from Main Store to a Department</DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="issueDate">Date</Label>
                    <Input
                      id="issueDate"
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="createdBy">Created By</Label>
                    <Input
                      id="createdBy"
                      value={createdBy}
                      onChange={(e) => setCreatedBy(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Issue Lines</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      <Plus className="h-4 w-4 mr-2" /> Add line
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {draftLines.map((l, idx) => {
                      const origin = stockItems.find((s) => s.id === l.originItemId) ?? null;
                      const dest = stockItems.find((s) => s.id === l.destinationItemId) ?? null;
                      const qty = Number(l.qty);
                      const qtyNum = Number.isFinite(qty) ? qty : 0;

                      const destOptions = origin
                        ? departmentItems.filter((d) => d.unitType === origin.unitType)
                        : departmentItems;

                      return (
                        <Card key={l.id} className="bg-muted/30">
                          <CardContent className="p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium">Line {idx + 1}</div>
                              {draftLines.length > 1 ? (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(l.id)}>
                                  Remove
                                </Button>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                              <div className="space-y-2">
                                <Label>Origin (Main Store)</Label>
                                <StockItemPicker
                                  value={l.originItemId}
                                  onChange={(v) => {
                                    setDraftLines((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== l.id) return x;
                                        const nextOrigin = stockItems.find((s) => s.id === v) ?? null;
                                        const currentDest = stockItems.find((s) => s.id === x.destinationItemId) ?? null;
                                        const destOk = nextOrigin && currentDest ? nextOrigin.unitType === currentDest.unitType : true;
                                        return { ...x, originItemId: v, destinationItemId: destOk ? x.destinationItemId : '' };
                                      })
                                    );
                                  }}
                                  items={storeItems}
                                  placeholder="Select store item"
                                />
                              </div>

                              <div className="hidden sm:flex justify-center pb-2">
                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                              </div>

                              <div className="space-y-2">
                                <Label>Destination (Department)</Label>
                                <StockItemPicker
                                  value={l.destinationItemId}
                                  onChange={(v) => setDraftLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, destinationItemId: v } : x)))}
                                  items={destOptions}
                                  placeholder={origin ? `Select ${origin.unitType} item` : 'Select department item'}
                                  disabled={destOptions.length === 0}
                                />
                                {origin ? (
                                  <div className="text-xs text-muted-foreground">Destination list filtered to unit: {origin.unitType}</div>
                                ) : null}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                              <div className="space-y-2 sm:col-span-1">
                                <Label>Issue Quantity</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0"
                                  value={l.qty}
                                  onChange={(e) => setDraftLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, qty: e.target.value } : x)))}
                                />
                              </div>
                              <div className="sm:col-span-2 text-sm">
                                {origin && dest && qtyNum > 0 ? (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <div className="text-xs text-muted-foreground">Origin After</div>
                                      <div className="font-medium">{(origin.currentStock - qtyNum).toFixed(2)} {origin.unitType}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground">Destination After</div>
                                      <div className="font-medium">{(dest.currentStock + qtyNum).toFixed(2)} {dest.unitType}</div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground">Select origin/destination and qty to preview.</div>
                                )}
                              </div>
                            </div>

                            {validated.lines.find((x) => x.id === l.id)?.touched && validated.lines.find((x) => x.id === l.id)?.errors.length ? (
                              <div className="text-xs text-destructive">
                                {validated.lines.find((x) => x.id === l.id)!.errors[0]}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {validated.validLines.length > 0 || validated.invalidTouchedLines.length > 0 ? (
                    <Card className="border-primary">
                      <CardContent className="p-3">
                        <p className="text-sm font-medium mb-2">Issue Summary</p>
                        <div className="flex items-center justify-between text-sm">
                          <span>Valid lines:</span>
                          <span className="font-medium">{validated.validLines.length}</span>
                        </div>
                        {validated.invalidTouchedLines.length ? (
                          <div className="flex items-center justify-between text-sm text-destructive">
                            <span>Lines to fix:</span>
                            <span className="font-medium">{validated.invalidTouchedLines.length}</span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between text-sm">
                          <span>Estimated value:</span>
                          <span className="font-medium">K {validated.totalValue.toFixed(2)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={confirmIssue} disabled={!validated.canConfirm}>
                  Confirm Issue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search issues..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" disabled>
          <Calendar className="h-4 w-4 mr-2" />
          Date Range
        </Button>
      </div>

      <div className="space-y-4">
        {issueGroups.map((group) => (
          <Card key={group.issueNo}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                <div>
                  <p className="font-medium">Issue #{group.issueNo}</p>
                  <p className="text-sm text-muted-foreground">
                    {group.date} • By {group.createdBy}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="font-medium">K {group.totalValue.toFixed(2)}</p>
                </div>
              </div>

              <DataTableWrapper className="border-0 rounded-none">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origin Code</TableHead>
                      <TableHead>Dest Code</TableHead>
                      <TableHead className="text-right">Was</TableHead>
                      <TableHead className="text-right">Issued</TableHead>
                      <TableHead className="text-right">Now</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((issue) => (
                      <TableRow key={issue.id}>
                        <TableCell className="font-mono">{issue.originItemCode}</TableCell>
                        <TableCell className="font-mono">{issue.destinationItemCode}</TableCell>
                        <TableCell className="text-right">
                          <NumericCell value={issue.wasQty} />
                        </TableCell>
                        <TableCell className="text-right">
                          <NumericCell value={issue.issuedQty} showSign colorCode />
                        </TableCell>
                        <TableCell className="text-right">
                          <NumericCell value={issue.nowQty} />
                        </TableCell>
                        <TableCell className="text-right">
                          <NumericCell value={issue.value} money showSign colorCode />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTableWrapper>
            </CardContent>
          </Card>
        ))}

        {!issueGroups.length && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">No stock issues found.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
