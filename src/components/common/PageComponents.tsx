import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function KPICard({ title, value, subtitle, trend, trendValue, icon, variant = 'default' }: KPICardProps) {
  const variantStyles = {
    default: 'border-transparent',
    success: 'border-l-4 border-l-success',
    warning: 'border-l-4 border-l-warning',
    danger: 'border-l-4 border-l-destructive',
  };

  const trendColors = {
    up: 'text-success',
    down: 'text-destructive',
    neutral: 'text-muted-foreground',
  };

  return (
    <div className={cn('mthunzi-card p-4', variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {trend && trendValue && (
            <p className={cn('text-xs mt-2', trendColors[trend])}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-3 rounded-lg bg-primary/10">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface DataTableWrapperProps {
  children: ReactNode;
  className?: string;
}

export function DataTableWrapper({ children, className }: DataTableWrapperProps) {
  return (
    <div className={cn('mthunzi-card', className)}>
      {children}
    </div>
  );
}

interface StatusBadgeProps {
  status: 'positive' | 'negative' | 'neutral' | 'warning';
  children: ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const styles = {
    positive: 'bg-success/10 text-success',
    negative: 'bg-destructive/10 text-destructive',
    neutral: 'bg-muted text-muted-foreground',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', styles[status])}>
      {children}
    </span>
  );
}

interface NumericCellProps {
  value: number;
  decimals?: number;
  prefix?: string;
  money?: boolean;
  showSign?: boolean;
  colorCode?: boolean;
}

export function NumericCell({ value, decimals = 2, prefix = '', money = false, showSign = false, colorCode = false }: NumericCellProps) {
  const { formatMoneyPrecise } = useCurrency();

  const n = Number.isFinite(value) ? value : 0;

  const displayValue = (() => {
    if (money) {
      const absFormatted = formatMoneyPrecise(Math.abs(n), decimals);
      if (n < 0) return `-${absFormatted}`;
      if (showSign && n > 0) return `+${absFormatted}`;
      return absFormatted;
    }

    const formatted = n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return showSign && n > 0 ? `+${formatted}` : formatted;
  })();
  
  let colorClass = '';
  if (colorCode) {
    if (n > 0) colorClass = 'status-positive';
    else if (n < 0) colorClass = 'status-negative';
    else colorClass = 'status-neutral';
  }

  return (
    <span className={cn('numeric', colorClass)}>
      {money ? displayValue : `${prefix}${displayValue}`}
    </span>
  );
}
