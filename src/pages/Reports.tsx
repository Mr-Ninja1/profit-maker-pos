import { FileText, TrendingUp, Package, ArrowRightLeft, Factory, Users, BarChart3, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageComponents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const reports = [
  { title: 'Management Overview', description: 'Daily summary with KPIs, profit, and activity', icon: BarChart3, path: '/app' },
  { title: 'ZRA Tax Season', description: 'One-click export of sales + VAT for ZRA portal', icon: FileText, path: '/app/zra-tax-season' },
  { title: 'Purchases (GRV)', description: 'Goods received vouchers, costs, and supplier receipts', icon: ShoppingCart, path: '/app/purchases' },
  { title: 'Stock on Hand', description: 'Current inventory levels by department', icon: Package, path: '/app/inventory/items' },
  { title: 'Stock Issues Report', description: 'Internal transfer history', icon: ArrowRightLeft, path: '/app/inventory/stock-issues' },
  { title: 'Stock Variance Report', description: 'Physical vs system count analysis', icon: TrendingUp, path: '/app/inventory/stock-take' },
  { title: 'Manufacturing Report', description: 'Batch production and yield analysis', icon: Factory, path: '/app/manufacturing/production' },
  { title: 'Staff Cashup Report', description: 'Staff sales and reconciliation', icon: Users, path: '/app/staff' },
];

export default function Reports() {
  return (
    <div>
      <PageHeader title="Reports" description="Access all system reports and analytics" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Link key={report.title} to={report.path}>
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10"><report.icon className="h-5 w-5 text-primary" /></div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{report.description}</p></CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
