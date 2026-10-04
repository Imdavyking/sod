import { createPublicClient, createWalletClient, custom, http, type Address, type EIP1193Provider } from "viem";
import { chain } from "./contracts";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const publicClient = createPublicClient({ chain, transport: http() });

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No injected wallet found. Install MetaMask or similar.");
  const wallet = createWalletClient({ chain, transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  try {
    await wallet.switchChain({ id: chain.id });
  } catch {
    await wallet.addChain({ chain });
    await wallet.switchChain({ id: chain.id });
  }
  return { wallet, account: account as Address };
}

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
