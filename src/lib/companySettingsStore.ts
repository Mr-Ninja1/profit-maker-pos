import type { CompanySettings } from '@/types/company';

const LEGACY_STORAGE_KEY = 'pmx.companySettings.v1';
const STORAGE_KEY_PREFIX = 'pmx.companySettings.v1.';

export const defaultCompanySettings: CompanySettings = {
  appName: 'Mthunzi-Smart',
  tagline: 'Back Office + POS',
  primaryColorHex: '#2563eb',
  brandType: 'restaurant',
};

function getKey(brandId?: string | null) {
  return brandId ? `${STORAGE_KEY_PREFIX}${brandId}` : LEGACY_STORAGE_KEY;
}

export const getCompanySettings = (brandId?: string | null): CompanySettings => {
  try {
    const key = getKey(brandId);
    const raw = localStorage.getItem(key);

    if (!raw) return defaultCompanySettings;
    const parsed = JSON.parse(raw) as Partial<CompanySettings>;

    return {
      ...defaultCompanySettings,
      ...parsed,
    };
  } catch {
    return defaultCompanySettings;
  }
};

export const saveCompanySettings = (settings: CompanySettings, brandId?: string | null) => {
  localStorage.setItem(getKey(brandId), JSON.stringify(settings));
};
