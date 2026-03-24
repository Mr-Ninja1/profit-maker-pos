import type { PaymentMethod } from '@/types/pos';
import { getActiveBrandId, subscribeActiveBrandId } from '@/lib/activeBrand';

const STORAGE_KEY = 'mthunzi.pos.paymentRequests.v1';

function storageKeyForBrand(brandId: string | null) {
  return `${STORAGE_KEY}.${brandId ? String(brandId) : 'none'}`;
}

let currentBrandId: string | null = getActiveBrandId();

type Listener = () => void;

export type PosPaymentRequest = {
  id: string;
  createdAt: string;
  tableNo: number;
  orderId: string;
  total: number;
  requestedBy?: string;
  note?: string;
  // optional: preselect method at till
  suggestedMethod?: PaymentMethod;
};

type StateV1 = {
  version: 1;
  requests: PosPaymentRequest[];
};

let state: StateV1 | null = null;
const listeners = new Set<Listener>();

subscribeActiveBrandId(() => {
  currentBrandId = getActiveBrandId();
  state = null;
  emit();
});

function emit() {
  for (const l of listeners) l();
}

function safeId(prefix: string) {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function load(): StateV1 {
  if (state) return state;
  try {
    const raw = localStorage.getItem(storageKeyForBrand(currentBrandId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StateV1>;
      if (parsed.version === 1 && Array.isArray(parsed.requests)) {
        state = { version: 1, requests: parsed.requests as PosPaymentRequest[] };
        return state;
      }
    }
  } catch {
    // ignore
  }
  state = { version: 1, requests: [] };
  try {
    localStorage.setItem(storageKeyForBrand(currentBrandId), JSON.stringify(state));
  } catch {
    // ignore
  }
  return state;
}

function save(next: StateV1) {
  state = next;
  try {
    localStorage.setItem(storageKeyForBrand(currentBrandId), JSON.stringify(next));
  } catch {
    // ignore
  }
  emit();
}

export function subscribePosPaymentRequests(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPosPaymentRequestsSnapshot(): PosPaymentRequest[] {
  return load().requests;
}

export function addPosPaymentRequest(input: Omit<PosPaymentRequest, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
  const now = input.createdAt ?? new Date().toISOString();
  const req: PosPaymentRequest = {
    id: input.id && input.id.trim() ? input.id : safeId('payreq'),
    createdAt: now,
    tableNo: input.tableNo,
    orderId: input.orderId,
    total: input.total,
    requestedBy: input.requestedBy,
    note: input.note,
    suggestedMethod: input.suggestedMethod,
  };

  const existing = load();
  // de-dupe: one request per orderId
  const next = [req, ...existing.requests.filter((r) => r.orderId !== req.orderId)];
  save({ version: 1, requests: next });
  return req;
}

export function resolvePosPaymentRequest(requestId: string) {
  const existing = load();
  const next = existing.requests.filter((r) => r.id !== requestId);
  save({ version: 1, requests: next });
}

export function resolvePosPaymentRequestByOrder(orderId: string) {
  const existing = load();
  const next = existing.requests.filter((r) => r.orderId !== orderId);
  save({ version: 1, requests: next });
}

export function clearPosPaymentRequests() {
  save({ version: 1, requests: [] });
}
