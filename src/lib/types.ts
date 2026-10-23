export type TransactionType = "INCOME" | "EXPENSE";
export type PartyType = "CUSTOMER" | "SUPPLIER" | "BOTH";
// An Account id — see CASH_ACCOUNT_ID / Account below.
export type PaymentMethod = string;
export type Role = "SUPER_ADMIN" | "ADMIN" | "STAFF";

// Super Admin has every Admin permission everywhere in the app — the only
// difference is Admins can't see or manage Super Admin accounts themselves
// (see GET/PATCH /api/users). So any "must be admin" check should pass for
// both roles; use this instead of comparing against "ADMIN" directly.
export function isAdminRole(role: Role) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

// Every payment/expense records which Account the money went through — the
// `paymentMethod` field holds that Account's id. "CASH" is the built-in cash
// account; bank accounts are added on the Accounts page.
export const CASH_ACCOUNT_ID = "CASH";

export type AccountType = "CASH" | "BANK";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  openingBalanceCents: number;
  active: boolean;
  // Present on GET /api/accounts: opening balance + money in − money out.
  balanceCents?: number;
  inCents?: number;
  outCents?: number;
};

// The hidden no-cash account party-to-party transfers are booked against
// (see PartyTransfer in schema.prisma). Never listed as a real account.
export const PARTY_TRANSFER_ACCOUNT_ID = "PARTY_TRANSFER";

export function accountName(accounts: Pick<Account, "id" | "name">[], id: string | null | undefined) {
  if (!id) return "—";
  if (id === PARTY_TRANSFER_ACCOUNT_ID) return "Party transfer";
  return accounts.find((a) => a.id === id)?.name ?? id;
}

// Best-effort match for free text from an imported spreadsheet column (e.g.
// "HDFC Bank", "cash") onto an account by name or id — falls back to Cash
// for anything unrecognized.
export function parsePaymentMethod(
  raw: string | null | undefined,
  accounts: Pick<Account, "id" | "name">[]
): PaymentMethod {
  const normalize = (v: string) => v.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const wanted = normalize(raw ?? "");
  if (!wanted) return CASH_ACCOUNT_ID;
  return (
    accounts.find((a) => normalize(a.id) === wanted || normalize(a.name) === wanted)?.id ??
    CASH_ACCOUNT_ID
  );
}

// Free Fatty Acid quality grade, offered on a Sale/Purchase line when the
// item is marked `ffaGraded` (e.g. copra/oil where FFA% affects grading).
// Half-grade steps from FFA-1 to FFA-10.
export const FFA_GRADES = [
  "FFA-1",
  "FFA-1.5",
  "FFA-2",
  "FFA-2.5",
  "FFA-3",
  "FFA-3.5",
  "FFA-4",
  "FFA-4.5",
  "FFA-5",
  "FFA-5.5",
  "FFA-6",
  "FFA-6.5",
  "FFA-7",
  "FFA-7.5",
  "FFA-8",
  "FFA-8.5",
  "FFA-9",
  "FFA-9.5",
  "FFA-10",
] as const;
export type FfaGrade = (typeof FFA_GRADES)[number];

export type Category = {
  id: string;
  name: string;
  type: TransactionType;
};

// Expense — categories are expense-only, income is tracked via Sale.
export type Expense = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  type: TransactionType;
  categoryId: string;
  category: Category;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  recordedBy: { name: string };
  // Bills this expense was charged to (see ExpenseAllocation).
  allocations?: ExpenseAllocationLine[];
};

type AllocatedBill = { id: string; billNumber: number; totalCents: number; party: { name: string } | null };
export type ExpenseAllocationLine = {
  id: string;
  amountCents: number;
  sale: AllocatedBill | null;
  purchase: AllocatedBill | null;
};

export type Party = {
  id: string;
  name: string;
  type: PartyType;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  notes: string | null;
  openingBalanceCents: number;
  balanceCents: number;
  // Unapplied "RECEIVED" advance credit (see PartyPayment) still available
  // to settle a future sale.
  availableAdvanceCents: number;
  // Mirror of the above for the other direction — unapplied "PAID" advance
  // credit still available to settle a future purchase. A party's net
  // advance position only ever favors one direction, so at most one of
  // these two is ever nonzero.
  availableAdvanceForPurchaseCents: number;
};

export type PartyPaymentDirection = "RECEIVED" | "PAID";

// An advance payment with a party, outside of any specific Sale/Purchase.
export type PartyPayment = {
  id: string;
  partyId: string;
  date: string;
  direction: PartyPaymentDirection;
  amountCents: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  // Set when this row is the excess half of a specific bill payment (see
  // PartyPayment.sourceSalePayment/sourcePurchasePayment in the schema) —
  // buildLedger uses this to avoid showing it a second time.
  sourceSalePaymentId: string | null;
  sourcePurchasePaymentId: string | null;
  // Set when this is one side of a party-to-party transfer.
  partyTransferId?: string | null;
};

// One row of GET /api/payments — a Sale/Purchase installment or a Party
// advance, normalized to one shape so they can share a single list/table.
export type CombinedPayment = {
  id: string;
  kind: "SALE" | "PURCHASE" | "ADVANCE";
  date: string;
  partyId: string | null;
  partyName: string;
  billNumber: number | null;
  refId: string;
  amountCents: number;
  direction: PartyPaymentDirection | null;
  paymentMethod: PaymentMethod;
  notes: string | null;
  // Set when this is one side of a party-to-party transfer.
  transfer?: { id: string; fromName: string; toName: string } | null;
};

export type Item = {
  id: string;
  name: string;
  unit: string;
  openingStockQty: number;
  lowStockThreshold: number | null;
  currentStockQty: number;
  ffaGraded: boolean;
  // Weighted-average cost per unit across all purchases of this item to
  // date (see getItemAverageCostMap) — not a stored/settable price, since
  // items no longer have one; used as the cost basis for profit reports.
  avgPurchaseCostCents: number;
};

// Additional charges (lorry rent, packing charge, coolie, etc.) added on
// top of a Sale/Purchase's item total.
export type ChargeType = {
  id: string;
  name: string;
};

export type EmailContact = {
  id: string;
  name: string;
  email: string;
};

export type SaleItemLine = {
  id: string;
  itemId: string;
  item: { name: string; unit: string; ffaGraded?: boolean };
  // The forward sale this line delivers against, if any.
  forwardSale?: { id: string; number: number } | null;
  quantity: number;
  priceCents: number;
  ffaBonusCents: number;
  lineTotalCents: number;
  taxPercent: number;
  taxCents: number;
  ffaGrade: FfaGrade | null;
};

export type ChargeLine = {
  id: string;
  chargeTypeId: string | null;
  label: string;
  amountCents: number;
};

export type PaymentSource = "CASH" | "ADVANCE";

export type PaymentLine = {
  id: string;
  date: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  source: PaymentSource;
  notes: string | null;
  // Set when this payment overshot the bill's due amount — the excess that
  // was carved off into advance credit for another bill (see
  // PartyPayment.sourceSalePayment/sourcePurchasePayment). The cash actually
  // handed over was amountCents + this, even though only amountCents counts
  // toward this bill.
  excessPartyPayment: { amountCents: number } | null;
};

export type Sale = {
  id: string;
  billNumber: number;
  date: string;
  partyId: string | null;
  party: { name: string; email: string | null } | null;
  items: SaleItemLine[];
  charges: ChargeLine[];
  payments: PaymentLine[];
  totalCents: number;
  paidCents: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  recordedBy: { name: string };
  // Present on GET /api/sales — purchases this sale's goods came from.
  linkedPurchases?: {
    id: string;
    items: { lineTotalCents: number }[];
    charges: { amountCents: number }[];
    expenseAllocations?: { amountCents: number }[];
  }[];
  // Present on list endpoints — expenses charged to this bill.
  expenseAllocations?: {
    amountCents: number;
    expense: { id: string; description: string; date: string };
  }[];
};

export type PurchaseItemLine = {
  id: string;
  itemId: string;
  item: { name: string; unit: string };
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  taxPercent: number;
  taxCents: number;
  ffaGrade: FfaGrade | null;
};

export type Purchase = {
  id: string;
  billNumber: number;
  date: string;
  partyId: string | null;
  party: { name: string; email: string | null } | null;
  items: PurchaseItemLine[];
  charges: ChargeLine[];
  payments: PaymentLine[];
  totalCents: number;
  paidCents: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  recordedBy: { name: string };
  // Present on GET /api/purchases — the sale this stock was bought for.
  linkedSale?: { id: string; billNumber: number } | null;
  // Present on GET /api/purchases — the combined bill this is part of.
  group?: { id: string; number: number } | null;
  // Present on list endpoints — expenses charged to this bill.
  expenseAllocations?: {
    amountCents: number;
    expense: { id: string; description: string; date: string };
  }[];
};

export type NoteSheetData = {
  rows: number;
  cols: number;
  // Sparse — only non-empty cells are stored, keyed by address (e.g. "A1").
  cells: Record<string, string>;
};

export type NoteSheet = {
  id: string;
  name: string;
  order: number;
  data: NoteSheetData;
  createdAt: string;
  updatedAt: string;
};
