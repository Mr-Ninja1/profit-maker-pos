import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CurrencyCode, ReceiptSettings } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import {
  getReceiptSettingsSnapshot,
  saveReceiptSettings,
  subscribeReceiptSettings,
} from '@/lib/receiptSettingsService';

type CurrencyModel = {
  currencyCode: CurrencyCode;
  currencySymbol: string;
  setCurrencyCode: (code: CurrencyCode) => void;
  formatMoney: (amount: number) => string;
  formatMoneyPrecise: (amount: number, decimals: number) => string;
  formatNumber: (amount: number, opts?: Intl.NumberFormatOptions) => string;
};

const CurrencyContext = createContext<CurrencyModel | null>(null);

function formatZmwK(amount: number) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `K ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyIntl(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function currencySymbolFromCode(currency: string) {
  const c = String(currency || '').toUpperCase();
  if (c === 'ZMW') return 'K';
  if (c === 'USD') return '$';
  if (c === 'ZAR') return 'R';
  if (c === 'EUR') return '€';
  if (c === 'GBP') return '£';
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: c,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? c;
  } catch {
    return c;
  }
}

export function CurrencyProvider(props: { children: React.ReactNode }) {
  const { brand, user } = useAuth();
  const brandId = String((brand as any)?.id ?? (user as any)?.brand_id ?? '');

  const receiptSettings = useSyncExternalStore(
    subscribeReceiptSettings,
    getReceiptSettingsSnapshot,
    getReceiptSettingsSnapshot
  );

  const [overrideCode, setOverrideCode] = useState<CurrencyCode | null>(null);

  // Reset any local override when switching brands.
  useEffect(() => {
    setOverrideCode(null);
  }, [brandId]);

  if (!receiptSettings) {
    throw new Error("CurrencyProvider: receiptSettings is null or undefined.");
  }

  const model = useMemo<CurrencyModel>(() => {
    const receiptCurrencyCode = (receiptSettings as ReceiptSettings).currencyCode;
    const brandCurrencyCode = (brand as any)?.brand_currency_code as CurrencyCode | undefined;
    const currencyCode = (overrideCode ?? brandCurrencyCode ?? receiptCurrencyCode ?? 'ZMW') as CurrencyCode;
    const currencySymbol = currencySymbolFromCode(currencyCode);

    return {
      currencyCode,
      currencySymbol,
      setCurrencyCode: (code) => {
        setOverrideCode(code);
        const cur = getReceiptSettingsSnapshot();
        saveReceiptSettings({ ...cur, currencyCode: code });

        // Persist to the brand row when available.
        if (supabase && brandId) {
          void supabase
            .from('brands')
            .update({ brand_currency_code: code })
            .eq('id', brandId);
        }
      },
      formatNumber: (amount, opts) => {
        const n = Number.isFinite(amount) ? amount : 0;
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, ...(opts ?? {}) }).format(n);
      },
      formatMoney: (amount) => {
        if (currencyCode === 'ZMW') return formatZmwK(amount);
        return formatCurrencyIntl(amount, currencyCode);
      },
      formatMoneyPrecise: (amount, decimals) => {
        const n = Number.isFinite(amount) ? amount : 0;
        const d = Number.isFinite(decimals) ? Math.max(0, Math.min(6, Math.floor(decimals))) : 2;
        if (currencyCode === 'ZMW') {
          return `${currencySymbol} ${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
        }
        try {
          return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currencyCode,
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: d,
            maximumFractionDigits: d,
          }).format(n);
        } catch {
          return `${currencySymbol} ${n.toFixed(d)}`;
        }
      },
    };
  }, [receiptSettings, brand, brandId, overrideCode]);

  return <CurrencyContext.Provider value={model}>{props.children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
