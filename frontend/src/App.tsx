import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import {
  SOD_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  chain,
  isConfigured,
  sodAbi,
  tokenAbi,
} from "./lib/contracts";
import { useAccount, useConnect, useDisconnect, useWalletClient } from "wagmi";
import { ConnectWallet } from "@zerodev/wallet-react-ui";
import { publicClient, shortAddr } from "./lib/wallet";
import { ZERODEV_PROJECT_ID } from "./lib/wagmi";
import PrivatePanel from "./PrivatePanel";
import { CampaignFields, CampaignHeader } from "./CampaignFields";
import {
  EMPTY_INFO,
  readCampaignInfo,
  validateInfo,
  type CampaignInfoData,
} from "./lib/campaignInfo";
import {
  computeCommitment,
  downloadReceipt,
  loadReceipts,
  newSecret,
  saveReceipt,
  updateReceipt,
  type Receipt,
} from "./lib/refunds";

interface Campaign {
  id: bigint;
  info: CampaignInfoData;
  creator: Address;
  goal: bigint;
  deadline: bigint;
  withdrawn: boolean;
  total: bigint;
  donationCount: bigint;
}

const fmt = (n: bigint) =>
  Number(formatUnits(n, TOKEN_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

function errMsg(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  return err.shortMessage || err.message || "Something went wrong";
}

export default function App() {
  // Auth + signing now come from the ZeroDev embedded wallet (Google / passkey / email) via wagmi.
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const wallet = (walletClient ?? null) as WalletClient | null;
  const account = (isConnected && address ? address : null) as Address | null;
  const [authOpen, setAuthOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>(() => loadReceipts());
  const [refunded, setRefunded] = useState<Record<string, boolean>>({});
  const [balance, setBalance] = useState<bigint>(0n);
  const [status, setStatus] = useState<{
    kind: "info" | "error" | "ok";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"public" | "private">("public");

  const refresh = useCallback(async () => {
    if (!isConfigured) return;
    const count = (await publicClient.readContract({
      address: SOD_ADDRESS,
      abi: sodAbi,
      functionName: "campaignCount",
    })) as bigint;
    const rows = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => BigInt(i)).map(
        async (id) => {
          const c = (await publicClient.readContract({
            address: SOD_ADDRESS,
            abi: sodAbi,
            functionName: "campaigns",
            args: [id],
          })) as readonly [Address, bigint, bigint, boolean, bigint, bigint];
          const info = await readCampaignInfo(SOD_ADDRESS, id);
          return {
            id,
            info,
            creator: c[0],
            goal: c[1],
            deadline: c[2],
            withdrawn: c[3],
            total: c[4],
            donationCount: c[5],
          } as Campaign;
        },
      ),
    );
    setCampaigns(rows.reverse());

    const mine = loadReceipts();
    setReceipts(mine);
    const flags: Record<string, boolean> = {};
    await Promise.all(
      mine
        .filter((r) => r.donationIndex !== "pending")
        .map(async (r) => {
          try {
            const d = (await publicClient.readContract({
              address: SOD_ADDRESS,
              abi: sodAbi,
              functionName: "getDonation",
              args: [BigInt(r.campaignId), BigInt(r.donationIndex)],
            })) as readonly [bigint, Hex, boolean];
            flags[r.secret] = d[2];
          } catch {
            /* receipt from another deployment */
          }
        }),
    );
    setRefunded(flags);

    if (account) {
      setBalance(
        (await publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [account],
        })) as bigint,
      );
    }
  }, [account]);

  useEffect(() => {
    refresh().catch((e) => setStatus({ kind: "error", text: errMsg(e) }));
  }, [refresh]);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(true);
    setStatus({ kind: "info", text: `${label}…` });
    try {
      const out = await fn();
      await refresh();
      setStatus({ kind: "ok", text: `${label}: done` });
      return out;
    } catch (e) {
      setStatus({ kind: "error", text: `${label}: ${errMsg(e)}` });
    } finally {
      setBusy(false);
    }
  }

  async function send(
    args: Parameters<WalletClient["writeContract"]>[0] extends infer A
      ? Omit<A & object, "account" | "chain">
      : never,
  ) {
    if (!wallet || !account) throw new Error("Sign in first");
    const hash = await wallet.writeContract({
      ...(args as object),
      account,
      chain,
    } as never);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  const openSignIn = () => {
    const connector =
      connectors.find((c: any) => c.id === "zerodev-wallet") ?? connectors[0];
    if (!ZERODEV_PROJECT_ID) {
      setStatus({
        kind: "error",
        text: "Set VITE_ZERODEV_PROJECT_ID to your ZeroDev project ID.",
      });
      return;
    }
    setAuthOpen(true);
    connect({ connector });
  };

  useEffect(() => {
    if (isConnected) setAuthOpen(false);
  }, [isConnected]);

  const mint = () =>
    run("Minting 1,000 test USDG", () =>
      send({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "mint",
        args: [account!, parseUnits("1000", TOKEN_DECIMALS)],
      } as never),
    );

  const create = (info: CampaignInfoData, goal: string, deadline: string) =>
    run("Creating campaign", () => {
      const ts = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
      return send({
        address: SOD_ADDRESS,
        abi: sodAbi,
        functionName: "createCampaign",
        args: [
          info.name.trim(),
          info.description.trim(),
          info.imageURI.trim(),
          parseUnits(goal, TOKEN_DECIMALS),
          ts,
        ],
      } as never);
    });

  const donate = (c: Campaign, amountStr: string, refundTo: Address) =>
    run("Donating", async () => {
      const amount = parseUnits(amountStr, TOKEN_DECIMALS);
      const allowance = (await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "allowance",
        args: [account!, SOD_ADDRESS],
      })) as bigint;
      if (allowance < amount) {
        setStatus({ kind: "info", text: "Approving USDG…" });
        await send({
          address: TOKEN_ADDRESS,
          abi: tokenAbi,
          functionName: "approve",
          args: [SOD_ADDRESS, amount],
        } as never);
      }

      // Persist the secret BEFORE sending, so a closed tab can never strand a donation.
      const secret = newSecret();
      const receipt: Receipt = {
        campaignId: c.id.toString(),
        donationIndex: "pending",
        amount: amount.toString(),
        secret,
        refundTo,
        createdAt: Date.now(),
      };
      saveReceipt(receipt);

      const hash = await send({
        address: SOD_ADDRESS,
        abi: sodAbi,
        functionName: "donate",
        args: [c.id, amount, computeCommitment(c.id, secret, refundTo)],
      } as never);

      const tx = await publicClient.getTransactionReceipt({ hash });
      const [log] = parseEventLogs({
        abi: sodAbi,
        eventName: "Donated",
        logs: tx.logs,
      });
      updateReceipt(secret, {
        donationIndex: log.args.donationIndex.toString(),
        txHash: hash,
      });
      downloadReceipt({
        ...receipt,
        donationIndex: log.args.donationIndex.toString(),
        txHash: hash,
      });
    });

  const refund = (r: Receipt) =>
    run("Refunding", () =>
      send({
        address: SOD_ADDRESS,
        abi: sodAbi,
        functionName: "refund",
        args: [
          BigInt(r.campaignId),
          BigInt(r.donationIndex),
          r.secret,
          r.refundTo,
        ],
      } as never),
    );

  const withdraw = (c: Campaign) =>
    run("Withdrawing", () =>
      send({
        address: SOD_ADDRESS,
        abi: sodAbi,
        functionName: "withdraw",
        args: [c.id],
      } as never),
    );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sod</h1>
          <p className="text-sm text-slate-400">
            Trustless crowdfunding on Arbitrum · testnet prototype
          </p>
        </div>
        {account ? (
          <div className="text-right text-sm">
            <div className="font-mono text-slate-300">{shortAddr(account)}</div>
            <button
              onClick={() => disconnect()}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Sign out
            </button>
            <div className="text-slate-500">{fmt(balance)} USDG</div>

            <a
              href="https://faucet.paxos.com/"
              className="mt-1 text-xs text-emerald-400 hover:underline disabled:opacity-50"
            >
              Get test USDG
            </a>
          </div>
        ) : (
          <button
            onClick={openSignIn}
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            Sign in
          </button>
        )}
      </header>

      {authOpen && !account && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <ConnectWallet size="md" onClose={() => setAuthOpen(false)} />
        </div>
      )}

      <div className="mb-4 flex gap-2 text-sm">
        {(["public", "private"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 ${
              mode === m
                ? "bg-slate-100 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {m === "public" ? "Public" : "Private (encrypted amounts)"}
          </button>
        ))}
      </div>

      {mode === "public" && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <strong>Public mode is fully transparent.</strong> Donor addresses and
          amounts are visible on-chain. Sod does not make donors anonymous. Not
          audited. Testnet only.
        </div>
      )}

      {mode === "public" && !isConfigured && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
          No deployment configured. Run{" "}
          <code className="text-emerald-400">
            npx hardhat run scripts/deploy.ts --network arbitrumSepolia
          </code>{" "}
          from the repo root, or set{" "}
          <code className="text-emerald-400">VITE_SOD_ADDRESS</code> and{" "}
          <code className="text-emerald-400">VITE_TOKEN_ADDRESS</code>.
        </div>
      )}

      {status && (
        <div
          className={`mb-6 rounded-lg p-3 text-sm ${
            status.kind === "error"
              ? "bg-red-500/10 text-red-300"
              : status.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          {status.text}
        </div>
      )}

      {mode === "private" && (
        <PrivatePanel
          wallet={wallet}
          account={account}
          busy={busy}
          run={run}
          send={(a) => send(a as never)}
        />
      )}

      {mode === "public" && account && isConfigured && (
        <CreateForm onCreate={create} busy={busy} />
      )}

      {mode === "public" && (
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          {campaigns.length === 0 && (
            <p className="text-sm text-slate-500">No campaigns yet.</p>
          )}
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id.toString()}
              c={c}
              account={account}
              busy={busy}
              receipts={receipts.filter(
                (r) => r.campaignId === c.id.toString(),
              )}
              refunded={refunded}
              onDonate={donate}
              onRefund={refund}
              onWithdraw={withdraw}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function CreateForm({
  onCreate,
  busy,
}: {
  onCreate: (info: CampaignInfoData, goal: string, deadline: string) => void;
  busy: boolean;
}) {
  const [info, setInfo] = useState<CampaignInfoData>(EMPTY_INFO);
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const valid =
    !validateInfo(info) &&
    Number(goal) > 0 &&
    deadline &&
    new Date(deadline).getTime() > Date.now();
  return (
    <form
      className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onCreate(info, goal, deadline);
      }}
    >
      <h2 className="font-semibold">Start a campaign</h2>
      <CampaignFields value={info} onChange={setInfo} />
      <div className="flex flex-wrap gap-3">
        <input
          className="input w-40 rounded-md bg-slate-800 px-3 py-2 text-sm"
          placeholder="Goal (USDG)"
          inputMode="decimal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <input
          className="rounded-md bg-slate-800 px-3 py-2 text-sm"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <button
          disabled={!valid || busy}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Create
        </button>
      </div>
    </form>
  );
}

function CampaignCard(props: {
  c: Campaign;
  account: Address | null;
  busy: boolean;
  receipts: Receipt[];
  refunded: Record<string, boolean>;
  onDonate: (c: Campaign, amount: string, refundTo: Address) => void;
  onRefund: (r: Receipt) => void;
  onWithdraw: (c: Campaign) => void;
}) {
  const { c, account, busy, receipts, refunded } = props;
  const [amount, setAmount] = useState("");
  const [custom, setCustom] = useState("");
  const [useFresh, setUseFresh] = useState(false);

  const ended = nowSec() >= c.deadline;
  const funded = c.total >= c.goal;
  const pct =
    c.goal === 0n ? 0 : Math.min(100, Number((c.total * 100n) / c.goal));
  const isCreator =
    !!account && account.toLowerCase() === c.creator.toLowerCase();
  const refundOpen = !ended || !funded;

  const state = useMemo(() => {
    if (!ended) return { label: "Active", cls: "bg-sky-500/20 text-sky-300" };
    if (c.withdrawn)
      return { label: "Paid out", cls: "bg-slate-500/20 text-slate-300" };
    if (funded)
      return { label: "Funded", cls: "bg-emerald-500/20 text-emerald-300" };
    return {
      label: "Failed · refunds open",
      cls: "bg-red-500/20 text-red-300",
    };
  }, [ended, funded, c.withdrawn]);

  const refundTo = (useFresh ? custom : account) as Address;
  const canDonate =
    !!account && !ended && Number(amount) > 0 && isAddress(refundTo ?? "");

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <CampaignHeader id={c.id} info={c.info} />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Campaign #{c.id.toString()}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${state.cls}`}>
          {state.label}
        </span>
      </div>
      <div className="mb-1 h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mb-3 flex justify-between text-sm text-slate-400">
        <span>
          {fmt(c.total)} / {fmt(c.goal)} USDG
        </span>
        <span>
          {ended ? "Ended" : "Ends"}{" "}
          {new Date(Number(c.deadline) * 1000).toLocaleString()}
        </span>
      </div>
      <div className="mb-3 text-xs text-slate-500">
        Creator <span className="font-mono">{shortAddr(c.creator)}</span> ·{" "}
        {c.donationCount.toString()} donations
      </div>

      {!ended && account && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="w-32 rounded-md bg-slate-800 px-3 py-2 text-sm"
              placeholder="Amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              disabled={!canDonate || busy}
              onClick={() => props.onDonate(c, amount, refundTo)}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Donate
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={useFresh}
              onChange={(e) => setUseFresh(e.target.checked)}
            />
            Send any refund to a different address
          </label>
          {useFresh && (
            <input
              className="w-full rounded-md bg-slate-800 px-3 py-2 font-mono text-xs"
              placeholder="0x… refund address"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
      )}

      {isCreator && ended && funded && !c.withdrawn && (
        <button
          disabled={busy}
          onClick={() => props.onWithdraw(c)}
          className="mt-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Withdraw {fmt(c.total)} USDG
        </button>
      )}

      {receipts.length > 0 && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Your donations on this device
          </div>
          <ul className="space-y-2">
            {receipts.map((r) => {
              const done = refunded[r.secret];
              const pending = r.donationIndex === "pending";
              return (
                <li
                  key={r.secret}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-300">
                    {fmt(BigInt(r.amount))} USDG{" "}
                    <span className="text-xs text-slate-500">
                      {pending ? "(unconfirmed)" : done ? "(refunded)" : ""}
                    </span>
                  </span>
                  <span className="flex gap-3">
                    <button
                      onClick={() => downloadReceipt(r)}
                      className="text-xs text-slate-400 hover:underline"
                    >
                      Back up
                    </button>
                    {!pending && !done && refundOpen && (
                      <button
                        disabled={busy}
                        onClick={() => props.onRefund(r)}
                        className="text-xs text-amber-300 hover:underline disabled:opacity-50"
                      >
                        Refund
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Refund secrets live only in this browser. Use Back up so you can
            refund from another device.
          </p>
        </div>
      )}
    </article>
  );
}
