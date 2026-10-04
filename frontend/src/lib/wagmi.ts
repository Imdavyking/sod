import { createConfig, http } from "wagmi";
import { zeroDevWallet } from "@zerodev/wallet-react-ui";
import { chain } from "./contracts";

/** ZeroDev project ID from https://dashboard.zerodev.app. */
export const ZERODEV_PROJECT_ID = (import.meta.env.VITE_ZERODEV_PROJECT_ID ||
  "") as string;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    zeroDevWallet({
      projectId: ZERODEV_PROJECT_ID,
      chains: [chain],
      // Onboarding: sign in with Google, a passkey or email and get an embedded wallet.
      // "EOA" keeps it a plain key-backed account, which is what CoFHE needs: decryption
      // permits are EIP-712 signatures that must verify against the connected address.
      mode: "EOA",
    }),
  ],
  transports: { [chain.id]: http() },
  // EIP-6963 discovery stays on (the default) so installed wallets such as MetaMask show up in the
  // sign-in widget as external-wallet options.
});
