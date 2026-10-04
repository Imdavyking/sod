import { createConfig, http } from "wagmi";
import { zeroDevWallet } from "@zerodev/wallet-react-ui";
import { chain, ZERODEV_RPC } from "./contracts";

/**
 * ZeroDev project ID (https://dashboard.zerodev.app). Set VITE_ZERODEV_PROJECT_ID, or it is
 * parsed out of the project RPC URL (https://rpc.zerodev.app/api/v3/<projectId>/chain/<id>).
 */
export const ZERODEV_PROJECT_ID = (import.meta.env.VITE_ZERODEV_PROJECT_ID ||
  ZERODEV_RPC.match(/\/v3\/([0-9a-f-]{36})/i)?.[1] ||
  "") as string;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    zeroDevWallet({
      projectId: ZERODEV_PROJECT_ID,
      chains: [chain],
      // '7702': the user's address is their embedded EOA, delegated to a Kernel smart account.
      // Keeping the address == the signing EOA matters here: CoFHE decryption permits are EIP-712
      // signatures that must verify against the connected address.
      mode: "7702",
    }),
  ],
  transports: { [chain.id]: http() },
  // No external-wallet connectors are configured, so skip EIP-6963 discovery. A broken
  // extension can otherwise stall startup (per the ZeroDev install docs).
  multiInjectedProviderDiscovery: false,
});
