import { useMemo, useState, useSyncExternalStore } from 'react';
import { Save, AlertTriangle, Check, Filter } from 'lucide-react';
import { PageHeader, DataTableWrapper, NumericCell, StatusBadge } from '@/components/common/PageComponents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { departments } from '@/data/mockData';
import { DepartmentId } from '@/types';
import { getStockItemsSnapshot, subscribeStockItems } from '@/lib/stockStore';
import { getStockTakesSnapshot, recordStockTake, subscribeStockTakes } from '@/lib/stockTakeStore';

export default function StockTake() {
  const stockItems = useSyncExternalStore(subscribeStockItems, getStockItemsSnapshot);
  const stockTakes = useSyncExternalStore(subscribeStockTakes, getStockTakesSnapshot);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [isStockTakeMode, setIsStockTakeMode] = useState(false);

  const latestSession = stockTakes[0] ?? null;
  const variances = latestSession?.variances ?? [];

  const filteredItems = stockItems.filter((item) => {
    return selectedDept === 'all' || item.departmentId === selectedDept;
  });

  const getDepartmentName = (deptId: DepartmentId) => {
    return departments.find(d => d.id === deptId)?.name || deptId;
  };

  const handleCountChange = (itemId: string, value: string) => {
    setPhysicalCounts((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const calculateVariance = (itemId: string, systemQty: number) => {
    const physical = parseFloat(physicalCounts[itemId] || '');
    if (isNaN(physical)) return null;
    return physical - systemQty;
  };

  const parsedPhysicalCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(physicalCounts)) {
      const n = parseFloat(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }, [physicalCounts]);

  const canSave = isStockTakeMode && Object.keys(parsedPhysicalCounts).length > 0;

  // Calculate totals for variance summary
  const totalPositiveVariance = variances
    .filter(v => v.varianceValue > 0)
    .reduce((sum, v) => sum + v.varianceValue, 0);

  const totalNegativeVariance = variances
    .filter(v => v.varianceValue < 0)
    .reduce((sum, v) => sum + v.varianceValue, 0);

  const netVariance = variances.reduce((sum, v) => sum + v.varianceValue, 0);

  function startStockTake() {
    setIsStockTakeMode(true);
    setPhysicalCounts({});
  }

  function cancelStockTake() {
    setIsStockTakeMode(false);
    setPhysicalCounts({});
  }

  function saveStockTake() {
    if (!canSave) return;
    recordStockTake({
      date: dateKeyLocal(new Date()),
      departmentId: (selectedDept === 'all' ? 'all' : (selectedDept as DepartmentId)),
      physicalCounts: parsedPhysicalCounts,
      createdBy: 'System',
      applyAdjustmentsToStock: true,
    });
    setIsStockTakeMode(false);
    setPhysicalCounts({});
  }

  return (
    <div>
      <PageHeader
        title="Stock Take"
        description={
          latestSession
            ? `Latest saved: ${latestSession.date} • Variance: K ${netVariance.toFixed(2)}`
            : 'Perform physical stock counts and generate variance reports'
        }
        actions={
          <div className="flex gap-2">
            {isStockTakeMode ? (
              <>
                <Button variant="outline" onClick={cancelStockTake}>
                  Cancel
                </Button>
                <Button onClick={saveStockTake} disabled={!canSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Stock Take
                </Button>
              </>
            ) : (
              <Button onClick={startStockTake}>
                <Check className="h-4 w-4 mr-2" />
                Start Stock Take
              </Button>
            )}
          </div>
        }
      />

      {/* Variance Summary Cards */}
      {!isStockTakeMode && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Positive Variance (Surplus)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-success">
                K {totalPositiveVariance.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Negative Variance (Shortage)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">
                K {Math.abs(totalNegativeVariance).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net Variance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${netVariance >= 0 ? 'text-success' : 'text-destructive'}`}>
                K {netVariance.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <Select value={selectedDept} onValueChange={setSelectedDept}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stock Take Mode */}
      {isStockTakeMode ? (
        <DataTableWrapper>
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="w-[60px]">Unit</TableHead>
                <TableHead className="text-right">System Qty</TableHead>
                <TableHead className="w-[150px]">Physical Count</TableHead>
                <TableHead className="text-right">Variance Qty</TableHead>
                <TableHead className="text-right">Variance Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const variance = calculateVariance(item.id, item.currentStock);
                const varianceValue = variance !== null ? variance * item.currentCost : null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.code}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-xs">{getDepartmentName(item.departmentId)}</TableCell>
                    <TableCell className="text-xs">{item.unitType}</TableCell>
                    <TableCell className="text-right">
                      <NumericCell value={item.currentStock} />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Count..."
                        className="h-8"
                        value={physicalCounts[item.id] || ''}
                        onChange={(e) => handleCountChange(item.id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {variance !== null ? (
                        <NumericCell value={variance} showSign colorCode />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {varianceValue !== null ? (
                        <NumericCell value={varianceValue} money showSign colorCode />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DataTableWrapper>
      ) : (
        /* Variance Report View */
        <div className="space-y-6">
          {departments.map((dept) => {
            const deptVariances = variances.filter(v => v.departmentId === dept.id);
            if (deptVariances.length === 0) return null;

            const deptTotal = deptVariances.reduce((sum, v) => sum + v.varianceValue, 0);

            return (
              <Card key={dept.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{dept.name}</CardTitle>
                    <span className={`font-medium ${deptTotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                      K {deptTotal.toFixed(2)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTableWrapper className="border-0 rounded-none">
                    <Table className="data-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-[60px]">Unit</TableHead>
                          <TableHead className="text-right">Lowest</TableHead>
                          <TableHead className="text-right">Highest</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                          <TableHead className="text-right">Times</TableHead>
                          <TableHead className="text-right">Var Qty</TableHead>
                          <TableHead className="text-right">Var Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptVariances.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono">{v.itemCode}</TableCell>
                            <TableCell className="font-medium">{v.itemName}</TableCell>
                            <TableCell className="text-xs">{v.unitType}</TableCell>
                            <TableCell className="text-right">
                              <NumericCell value={v.lowestCost} />
                            </TableCell>
                            <TableCell className="text-right">
                              <NumericCell value={v.highestCost} />
                            </TableCell>
                            <TableCell className="text-right">
                              <NumericCell value={v.currentCost} />
                            </TableCell>
                            <TableCell className="text-right">{v.timesHadVariance}</TableCell>
                            <TableCell className="text-right">
                              <NumericCell value={v.varianceQty} showSign colorCode />
                            </TableCell>
                            <TableCell className="text-right">
                              <NumericCell value={v.varianceValue} money showSign colorCode />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </DataTableWrapper>
                </CardContent>
              </Card>
            );
          })}

          {!variances.length && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">No variance report yet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Start a stock take, enter physical counts, then click “Save Stock Take”.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function dateKeyLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
