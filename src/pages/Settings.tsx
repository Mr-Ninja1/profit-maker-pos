import { PageHeader } from '@/components/common/PageComponents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { ReceiptSettings } from '@/types';
import { getReceiptSettings, saveReceiptSettings } from '@/lib/receiptSettingsService';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink } from 'react-router-dom';
import { useBranding } from '@/contexts/BrandingContext';
import { getFeatureFlagsSnapshot, setFeatureEnabled, subscribeFeatureFlags } from '@/lib/featureFlagsStore';
import { addCategory, getCategoriesSnapshot, refreshCategories, subscribeCategories } from '@/lib/categoriesStore';
import { addSupplier, getSuppliersSnapshot, refreshSuppliers, subscribeSuppliers } from '@/lib/suppliersStore';

export default function Settings() {
  const { hasPermission } = useAuth();
  const { settings, reset } = useBranding();
  const flags = useSyncExternalStore(subscribeFeatureFlags, getFeatureFlagsSnapshot, getFeatureFlagsSnapshot);
  const intelligenceEnabled = Boolean(flags.flags.intelligenceWorkspace);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => getReceiptSettings());
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setReceiptSettings(getReceiptSettings());
  }, []);

  const isZambia = useMemo(() => receiptSettings.countryCode === 'ZM', [receiptSettings.countryCode]);

  const save = () => {
    saveReceiptSettings(receiptSettings);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const categoriesSnap = useSyncExternalStore(subscribeCategories, getCategoriesSnapshot, getCategoriesSnapshot);
  const suppliersSnap = useSyncExternalStore(subscribeSuppliers, getSuppliersSnapshot, getSuppliersSnapshot);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierCode, setNewSupplierCode] = useState('');

  useEffect(() => {
    // Best-effort refresh when opening Settings.
    void refreshCategories().catch(() => {});
    void refreshSuppliers().catch(() => {});
  }, []);

  const onAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setNewCategoryName('');
    try {
      await addCategory(name);
    } catch (e) {
      console.warn('Failed to add category', e);
    }
  };

  const onAddSupplier = async () => {
    const name = newSupplierName.trim();
    const code = newSupplierCode.trim() || undefined;
    if (!name) return;
    setNewSupplierName('');
    setNewSupplierCode('');
    try {
      await addSupplier({ name, code });
    } catch (e) {
      console.warn('Failed to add supplier', e);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="System configuration and preferences" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">App name</div>
            <div className="text-xs text-muted-foreground">Current: {settings.appName}</div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                reset();
                setSavedAt(new Date().toLocaleTimeString());
              }}
            >
              Reset Branding
            </Button>

            {hasPermission('manageSettings') && (
              <Button asChild variant="outline">
                <NavLink to="/app/company-settings">Open</NavLink>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Advanced</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-medium">Mthunzi Intelligence Workspace</div>
            <div className="text-xs text-muted-foreground">Power BI-style live dashboard with draggable widgets and clean data.</div>
          </div>

          <div className="flex items-center gap-3">
            {hasPermission('manageSettings') && (
              <Button asChild variant="outline">
                <NavLink to="/app/intelligence">Open</NavLink>
              </Button>
            )}

            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">Off</div>
              <Switch
                checked={intelligenceEnabled}
                disabled={!hasPermission('manageSettings')}
                onCheckedChange={(v) => {
                  if (!hasPermission('manageSettings')) return;
                  setFeatureEnabled('intelligenceWorkspace', Boolean(v));
                }}
              />
              <div className="text-xs text-muted-foreground">On</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Receipt Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Country</div>
              <Input
                value={receiptSettings.countryCode}
                onChange={(e) => setReceiptSettings((s) => ({ ...s, countryCode: e.target.value as ReceiptSettings['countryCode'] }))}
                placeholder="ZM"
              />
              <div className="text-xs text-muted-foreground">
                Zambia uses smart QR for verification; others use review/digital links.
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Currency</div>
              <Input
                value={receiptSettings.currencyCode}
                onChange={(e) => setReceiptSettings((s) => ({ ...s, currencyCode: e.target.value as ReceiptSettings['currencyCode'] }))}
                placeholder="ZMW"
              />
              <div className="text-xs text-muted-foreground">Used for totals and USD conversion.</div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Legal Footer</div>
            <Textarea
              value={receiptSettings.legalFooter}
              onChange={(e) => setReceiptSettings((s) => ({ ...s, legalFooter: e.target.value }))}
              placeholder="Paste your required legal text here..."
              rows={4}
            />
          </div>

          {!isZambia && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Google Review URL (QR)</div>
                <Input
                  value={receiptSettings.googleReviewUrl ?? ''}
                  onChange={(e) => setReceiptSettings((s) => ({ ...s, googleReviewUrl: e.target.value || undefined }))}
                  placeholder="https://g.page/r/.../review"
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Digital Receipt Base URL (QR)</div>
                <Input
                  value={receiptSettings.digitalReceiptBaseUrl ?? ''}
                  onChange={(e) => setReceiptSettings((s) => ({ ...s, digitalReceiptBaseUrl: e.target.value || undefined }))}
                  placeholder="https://yourdomain.com/r/"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save}>Save Receipt Settings</Button>
            {savedAt && <div className="text-xs text-muted-foreground">Saved at {savedAt}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Categories</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button onClick={onAddCategory} disabled={!newCategoryName.trim() || !hasPermission('manageSettings')}>Add</Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {categoriesSnap.categories.length === 0 ? (
              <div className="text-sm text-muted-foreground">No categories defined.</div>
            ) : (
              categoriesSnap.categories.map((cat) => (
                <div key={cat.id} className="p-3 bg-muted rounded-md text-sm">{cat.name}</div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Suppliers</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Supplier name"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
            />
            <Input
              placeholder="Code (optional)"
              value={newSupplierCode}
              onChange={(e) => setNewSupplierCode(e.target.value)}
            />
            <Button onClick={onAddSupplier} disabled={!newSupplierName.trim() || !hasPermission('manageSettings')}>Add</Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {suppliersSnap.suppliers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No suppliers defined.</div>
            ) : (
              suppliersSnap.suppliers.map((s) => (
                <div key={s.id} className="p-3 bg-muted rounded-md text-sm">{s.name}{s.code ? ` • ${s.code}` : ''}</div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
