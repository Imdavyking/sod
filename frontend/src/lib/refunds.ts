import {
  encodeAbiParameters,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";

/** Receipt the donor needs to refund later. The secret never leaves the browser until a refund. */
export interface Receipt {
  campaignId: string;
  donationIndex: string;
  amount: string; // raw token units
  secret: Hex;
  refundTo: Address;
  txHash?: Hex;
  createdAt: number;
  /** "private" = SodConfidentialCrowdfund (Phase 2). Missing = public SodCrowdfund (Phase 1). */
  mode?: "private";
}

const KEY = "sod:receipts:v1";

export function newSecret(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Must match the contract: keccak256(abi.encode(campaignId, refundSecret, refundTo)). */
export function computeCommitment(
  campaignId: bigint,
  secret: Hex,
  refundTo: Address,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "bytes32" }, { type: "address" }],
      [campaignId, secret, refundTo],
    ),
  );
}

export function loadReceipts(): Receipt[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveReceipt(r: Receipt) {
  const all = loadReceipts();
  all.push(r);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function downloadReceipt(r: Receipt) {
  const blob = new Blob([JSON.stringify(r, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sod-refund-campaign${r.campaignId}-donation${r.donationIndex}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Replace a stored receipt (matched by secret) with an updated copy. */
export function updateReceipt(secret: Hex, patch: Partial<Receipt>) {
  const all = loadReceipts().map((r) =>
    r.secret === secret ? { ...r, ...patch } : r,
  );
  localStorage.setItem(KEY, JSON.stringify(all));
}
