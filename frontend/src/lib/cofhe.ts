import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";
import { chains } from "@cofhe/sdk/chains";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hex, type WalletClient } from "viem";
import { chain } from "./contracts";

// The SDK bundles its own copy of viem, so its client types are not identical to ours. The shapes match;
// we cast at this one boundary instead of letting the mismatch leak through the app.
type CofheClient = ReturnType<typeof createCofheClient>;

const config = createCofheConfig({ supportedChains: [chains.arbSepolia] });
const clients = new Map<string, CofheClient>();

/** One connected CoFHE client per account. `walletClient` must be able to sign EIP-712 (an EOA wallet). */
export async function getCofhe(walletClient: WalletClient, account: Address): Promise<CofheClient> {
  const key = account.toLowerCase();
  const existing = clients.get(key);
  if (existing) return existing;

  const client = createCofheClient(config);
  const publicClient = createPublicClient({ chain, transport: http() });
  // Rebind the wallet client to an explicit account so the SDK can read `walletClient.account`.
  const bound = createWalletClient({ account, chain, transport: custom(window.ethereum!) });
  await client.connect(publicClient as never, (walletClient.account ? walletClient : bound) as never);
  clients.set(key, client);
  return client;
}

/**
 * Encrypt a uint64 amount for `consumer`. Returns the handle and proof to pass as
 * (externalEuint64 encAmount, bytes proof).
 *
 * `sender` is whoever will be msg.sender when the input is consumed. For Phase 3 that is the Kernel
 * smart account, which is not the connected wallet, so we set it explicitly.
 */
export async function encryptAmount(
  client: CofheClient,
  amount: bigint,
  consumer: Address,
  sender?: Address
): Promise<{ handle: Hex; proof: Hex }> {
  let builder = client.encryptInputs([Encryptable.uint64(amount)]).setConsumingContract(consumer);
  if (sender) builder = builder.setAccount(sender);
  const [handle, proof] = (await builder.execute()) as unknown as [Hex, Hex];
  return { handle, proof };
}

/** Decrypt a uint64 handle the connected account is allowed to read. Throws if access was not granted. */
export async function decryptUint64(client: CofheClient, handle: Hex): Promise<bigint> {
  await client.acp.getOrCreateSelfACP();
  return (await client.decryptForView(handle, FheTypes.Uint64).execute()) as bigint;
}

/** Decrypt an unshield claim so it can be submitted on-chain. */
export async function decryptForClaim(client: CofheClient, ctHash: Hex) {
  return (await client.decryptForTx(ctHash).withoutACP().execute()) as { decryptedValue: bigint; signature: Hex };
}
