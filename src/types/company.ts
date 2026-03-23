import type { CurrencyCode } from '@/types';

export type CompanySettings = {
  appName: string;
  tagline?: string;
  primaryColorHex: string; // e.g. #3B82F6
  logoDataUrl?: string; // data: URL from file upload (or later: remote URL)
  brandType?: 'restaurant' | 'retail';
  currencyCode?: CurrencyCode;
  metadata?: Record<string, any>;
};
