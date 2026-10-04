import type { Abi, Address } from "viem";
import { publicClient } from "./wallet";

export interface CampaignInfoData {
  name: string;
  description: string;
  imageURI: string;
}

export const EMPTY_INFO: CampaignInfoData = {
  name: "",
  description: "",
  imageURI: "",
};

// Keep in sync with contracts/CampaignInfo.sol. The contract counts BYTES, not characters.
export const MAX_NAME_BYTES = 80;
export const MAX_DESCRIPTION_BYTES = 2000;
export const MAX_IMAGE_URI_BYTES = 300;

const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

/** Returns an error message, or null if the info would be accepted by the contract. */
export function validateInfo(info: CampaignInfoData): string | null {
  const name = info.name.trim();
  if (!name) return "Give the campaign a name.";
  if (byteLength(name) > MAX_NAME_BYTES)
    return `Name is too long (max ${MAX_NAME_BYTES} bytes).`;
  if (byteLength(info.description.trim()) > MAX_DESCRIPTION_BYTES)
    return `Description is too long (max ${MAX_DESCRIPTION_BYTES} bytes).`;
  const img = info.imageURI.trim();
  if (img) {
    if (byteLength(img) > MAX_IMAGE_URI_BYTES)
      return `Image link is too long (max ${MAX_IMAGE_URI_BYTES} bytes).`;
    if (!safeImageUrl(img))
      return "Image link must start with https:// or ipfs://";
  }
  return null;
}

const GATEWAY = (
  (import.meta.env.VITE_IPFS_GATEWAY as string | undefined) ||
  "https://ipfs.io/ipfs/"
).replace(/\/?$/, "/");

/**
 * Turns the on-chain image link into something safe to put in an <img src>.
 * Only https:// and ipfs:// are allowed. Anything else (javascript:, data:, http:, file:) returns null,
 * because the link was typed by the campaign creator and must be treated as untrusted.
 */
export function safeImageUrl(uri: string): string | null {
  const u = uri.trim();
  if (u.startsWith("ipfs://")) {
    const path = u.slice("ipfs://".length).replace(/^ipfs\//, "");
    return /^[A-Za-z0-9._~\-/%]+$/.test(path) ? GATEWAY + path : null;
  }
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const infoAbi = [
  {
    type: "function",
    name: "getCampaignInfo",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "imageURI", type: "string" },
    ],
  },
] as const satisfies Abi;

export async function readCampaignInfo(
  contract: Address,
  id: bigint,
): Promise<CampaignInfoData> {
  const [name, description, imageURI] = (await publicClient.readContract({
    address: contract,
    abi: infoAbi,
    functionName: "getCampaignInfo",
    args: [id],
  })) as readonly [string, string, string];
  return { name, description, imageURI };
}
