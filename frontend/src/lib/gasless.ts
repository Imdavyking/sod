import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ZERODEV_RPC, chain } from "./contracts";

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

export interface Call {
  to: Address;
  data: Hex;
  value?: bigint;
}

/**
 * Phase 3: a Kernel smart account owned by a throwaway EOA, with gas sponsored by a ZeroDev paymaster.
 *
 * The account address is deterministic from the key, so it can be rebuilt later (for a refund) from the
 * key stored in the donor's receipt.
 */
export async function createGaslessAccount(privateKey: Hex = generatePrivateKey()) {
  if (!ZERODEV_RPC) throw new Error("Set VITE_ZERODEV_RPC to your ZeroDev project RPC for Arbitrum Sepolia");

  const signer = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(ZERODEV_RPC) });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion });
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  });

  const paymaster = createZeroDevPaymasterClient({ chain, transport: http(ZERODEV_RPC) });
  const client = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(ZERODEV_RPC),
    client: publicClient,
    paymaster: {
      getPaymasterData: (userOperation) => paymaster.sponsorUserOperation({ userOperation }),
    },
  });

  return { privateKey, signer, account, client, address: account.address as Address };
}

/** Send calls as ONE sponsored UserOperation and return the transaction hash it landed in. */
export async function sendSponsored(
  kernel: Awaited<ReturnType<typeof createGaslessAccount>>,
  calls: Call[]
): Promise<Hex> {
  const userOpHash = await kernel.client.sendUserOperation({
    callData: await kernel.account.encodeCalls(calls.map((c) => ({ ...c, value: c.value ?? 0n }))),
  });
  const receipt = await kernel.client.waitForUserOperationReceipt({ hash: userOpHash });
  return receipt.receipt.transactionHash;
}
