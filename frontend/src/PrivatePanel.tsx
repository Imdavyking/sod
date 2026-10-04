import { useCallback, useEffect, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import {
  ECUSDG_ADDRESS,
  SOD_CONF_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  ecusdgAbi,
  isPrivateConfigured,
  sodConfAbi,
  tokenAbi,
} from "./lib/contracts";
import {
  computeCommitment,
  downloadReceipt,
  loadReceipts,
  newSecret,
  saveReceipt,
  updateReceipt,
  type Receipt,
} from "./lib/refunds";
import { publicClient, shortAddr } from "./lib/wallet";
import { CampaignFields, CampaignHeader } from "./CampaignFields";
import {
  EMPTY_INFO,
  readCampaignInfo,
  validateInfo,
  type CampaignInfoData,
} from "./lib/campaignInfo";

interface PCampaign {
  id: bigint;
  info: CampaignInfoData;
  creator: Address;
  goal: bigint;
  deadline: bigint;
  withdrawn: boolean;
  donationCount: bigint;
}

// The Fhenix SDK is large and has side effects, so it loads only when private mode is used.
const loadCofhe = () => import("./lib/cofhe");

type Run = <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>;
type Send = (args: object) => Promise<Hex>;

const fmt = (n: bigint) =>
  Number(formatUnits(n, TOKEN_DECIMALS)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));
const DAY = 24 * 60 * 60;

export default function PrivatePanel(props: {
  wallet: WalletClient | null;
  account: Address | null;
  busy: boolean;
  run: Run;
  send: Send;
}) {
  const { wallet, account, busy, run, send } = props;
  const [campaigns, setCampaigns] = useState<PCampaign[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [refunded, setRefunded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [shieldAmt, setShieldAmt] = useState("");
  const [unshieldAmt, setUnshieldAmt] = useState("");
  const [info, setInfo] = useState<CampaignInfoData>(EMPTY_INFO);
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");

  const act: Run = async (label, fn) => {
    const r = await run(label, fn);
    setTick((t) => t + 1);
    return r;
  };

  const load = useCallback(async () => {
    if (!isPrivateConfigured) return;
    const count = (await publicClient.readContract({
      address: SOD_CONF_ADDRESS,
      abi: sodConfAbi,
      functionName: "campaignCount",
    })) as bigint;
    const rows = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => BigInt(i)).map(
        async (id) => {
          const c = (await publicClient.readContract({
            address: SOD_CONF_ADDRESS,
            abi: sodConfAbi,
            functionName: "campaigns",
            args: [id],
          })) as readonly [Address, bigint, bigint, boolean, bigint];
          const info = await readCampaignInfo(SOD_CONF_ADDRESS, id);
          return {
            id,
            info,
            creator: c[0],
            goal: c[1],
            deadline: c[2],
            withdrawn: c[3],
            donationCount: c[4],
          } as PCampaign;
        },
      ),
    );
    setCampaigns(rows.reverse());

    const mine = loadReceipts().filter((r) => r.mode === "private");
    setReceipts(mine);
    const flags: Record<string, boolean> = {};
    await Promise.all(
      mine
        .filter((r) => r.donationIndex !== "pending")
        .map(async (r) => {
          try {
            const d = (await publicClient.readContract({
              address: SOD_CONF_ADDRESS,
              abi: sodConfAbi,
              functionName: "getDonation",
              args: [BigInt(r.campaignId), BigInt(r.donationIndex)],
            })) as readonly [Hex, Hex, boolean];
            flags[r.secret] = d[2];
          } catch {
            /* receipt from a different deployment */
          }
        }),
    );
    setRefunded(flags);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, tick]);

  const cofhe = async () => {
    if (!wallet || !account) throw new Error("Sign in first");
    return (await loadCofhe()).getCofhe(wallet, account);
  };

  // ---------- Phase 2 actions ----------

  /** Public wrap of USDG into eUSDG. The wrapped amount is visible on-chain. */
  const shield = (to: Address, amountStr: string) =>
    act("Shielding USDG", async () => {
      const amount = parseUnits(amountStr, TOKEN_DECIMALS);
      await send({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "approve",
        args: [ECUSDG_ADDRESS, amount],
      });
      await send({
        address: ECUSDG_ADDRESS,
        abi: ecusdgAbi,
        functionName: "shield",
        args: [to, amount],
      });
    });

  const ensureOperator = async () => {
    const ok = (await publicClient.readContract({
      address: ECUSDG_ADDRESS,
      abi: ecusdgAbi,
      functionName: "isOperator",
      args: [account!, SOD_CONF_ADDRESS],
    })) as boolean;
    if (!ok) {
      await send({
        address: ECUSDG_ADDRESS,
        abi: ecusdgAbi,
        functionName: "setOperator",
        args: [SOD_CONF_ADDRESS, Number(nowSec()) + 30 * DAY],
      });
    }
  };

  const create = () =>
    act("Creating campaign", async () => {
      const ts = BigInt(Math.floor(new Date(deadline).getTime() / 1000));
      await send({
        address: SOD_CONF_ADDRESS,
        abi: sodConfAbi,
        functionName: "createCampaign",
        args: [
          info.name.trim(),
          info.description.trim(),
          info.imageURI.trim(),
          parseUnits(goal, TOKEN_DECIMALS),
          ts,
        ],
      });
    });

  const donate = (c: PCampaign, amountStr: string, refundTo: Address) =>
    act("Donating privately", async () => {
      const amount = parseUnits(amountStr, TOKEN_DECIMALS);
      await ensureOperator();

      const secret = newSecret();
      const receipt: Receipt = {
        campaignId: c.id.toString(),
        donationIndex: "pending",
        amount: amount.toString(),
        secret,
        refundTo,
        createdAt: Date.now(),
        mode: "private",
      };
      saveReceipt(receipt); // persist the secret BEFORE sending

      setStatusHint(
        "Encrypting amount (this runs a zero-knowledge proof, it can take a while)…",
      );
      const { handle, proof } = await (
        await loadCofhe()
      ).encryptAmount(await cofhe(), amount, SOD_CONF_ADDRESS);
      const hash = await send({
        address: SOD_CONF_ADDRESS,
        abi: sodConfAbi,
        functionName: "donate",
        args: [
          c.id,
          handle,
          proof,
          computeCommitment(c.id, secret, refundTo),
          zeroAddress,
        ],
      });
      const index = await donationIndexFrom(hash);
      updateReceipt(secret, { donationIndex: index, txHash: hash });
      downloadReceipt({ ...receipt, donationIndex: index, txHash: hash });
    });

  const refund = (r: Receipt) =>
    act("Refunding", () =>
      send({
        address: SOD_CONF_ADDRESS,
        abi: sodConfAbi,
        functionName: "refund",
        args: [
          BigInt(r.campaignId),
          BigInt(r.donationIndex),
          r.secret,
          r.refundTo,
        ],
      }),
    );

  const withdraw = (c: PCampaign) =>
    act("Withdrawing", () =>
      send({
        address: SOD_CONF_ADDRESS,
        abi: sodConfAbi,
        functionName: "withdraw",
        args: [c.id],
      }),
    );

  /** Convert confidential tokens back to plain USDG: burn, decrypt the claim, then claim. */
  const unshield = () =>
    act("Unshielding to USDG", async () => {
      const amount = parseUnits(unshieldAmt, TOKEN_DECIMALS);
      await send({
        address: ECUSDG_ADDRESS,
        abi: ecusdgAbi,
        functionName: "unshield",
        args: [account!, account!, amount],
      });
      const claims = (await publicClient.readContract({
        address: ECUSDG_ADDRESS,
        abi: ecusdgAbi,
        functionName: "getUserClaims",
        args: [account!],
      })) as readonly { id: Hex; ctHash: Hex; claimed: boolean }[];
      const claim = [...claims].reverse().find((x) => !x.claimed);
      if (!claim) throw new Error("No pending claim found");
      setStatusHint("Waiting for the CoFHE network to decrypt the claim…");
      const { decryptedValue, signature } = await (
        await loadCofhe()
      ).decryptForClaim(await cofhe(), claim.ctHash);
      await send({
        address: ECUSDG_ADDRESS,
        abi: ecusdgAbi,
        functionName: "claimUnshielded",
        args: [claim.id, decryptedValue, signature],
      });
    });

  // ---------- Reveal helpers (decrypt locally, never on-chain) ----------

  const reveal = (key: string, label: string, readHandle: () => Promise<Hex>) =>
    act(label, async () => {
      const handle = await readHandle();
      if (/^0x0+$/.test(handle))
        throw new Error("Nothing encrypted here yet for this address.");
      const value = await (
        await loadCofhe()
      ).decryptUint64(await cofhe(), handle);
      setRevealed((p) => ({ ...p, [key]: `${fmt(value)} USDG` }));
    });

  const revealBalance = () =>
    reveal(
      "balance",
      "Decrypting your balance",
      async () =>
        (await publicClient.readContract({
          address: ECUSDG_ADDRESS,
          abi: ecusdgAbi,
          functionName: "confidentialBalanceOf",
          args: [account!],
        })) as Hex,
    );

  const revealDonation = (r: Receipt) =>
    reveal(
      `d${r.secret}`,
      "Decrypting donation",
      async () =>
        (
          (await publicClient.readContract({
            address: SOD_CONF_ADDRESS,
            abi: sodConfAbi,
            functionName: "getDonation",
            args: [BigInt(r.campaignId), BigInt(r.donationIndex)],
          })) as readonly [Hex, Hex, boolean]
        )[0],
    );

  const revealTotal = (c: PCampaign) =>
    reveal(
      `t${c.id}`,
      "Decrypting campaign total",
      async () =>
        (await publicClient.readContract({
          address: SOD_CONF_ADDRESS,
          abi: sodConfAbi,
          functionName: "totalHandle",
          args: [c.id],
        })) as Hex,
    );

  // ---------- helpers ----------

  const [hint, setStatusHint] = useState("");

  async function donationIndexFrom(hash: Hex): Promise<string> {
    const tx = await publicClient.getTransactionReceipt({ hash });
    const [log] = parseEventLogs({
      abi: sodConfAbi,
      eventName: "Donated",
      logs: tx.logs,
    });
    return log.args.donationIndex.toString();
  }

  if (!isPrivateConfigured) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
        Private mode needs the Phase 2 contracts. Deploy with{" "}
        <code className="text-emerald-400">
          npx hardhat run scripts/deploy.ts --network arbitrumSepolia
        </code>{" "}
        (it writes <code className="text-emerald-400">confidentialToken</code>{" "}
        and <code className="text-emerald-400">sodConfidential</code>) or set{" "}
        <code className="text-emerald-400">VITE_SOD_CONF_ADDRESS</code> and{" "}
        <code className="text-emerald-400">VITE_ECUSDG_ADDRESS</code>.
      </div>
    );
  }

  const validCreate =
    !validateInfo(info) &&
    Number(goal) > 0 &&
    deadline &&
    new Date(deadline).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200">
        <strong>Private mode hides amounts, not people.</strong> Donation
        amounts and the running total are encrypted. Donor addresses, the goal,
        the deadline and refund events stay public. Wrapping USDG into eUSDG is
        public, so wrap more than you donate.
      </div>

      {hint && busy && (
        <div className="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">
          {hint}
        </div>
      )}

      {account && (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-semibold">Your confidential balance (eUSDG)</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              disabled={busy}
              onClick={revealBalance}
              className="rounded-md bg-slate-800 px-3 py-2 hover:bg-slate-700 disabled:opacity-40"
            >
              Reveal balance
            </button>
            <span className="text-slate-300">
              {revealed.balance ?? "🔒 encrypted"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-32 rounded-md bg-slate-800 px-3 py-2 text-sm"
              placeholder="Wrap USDG"
              inputMode="decimal"
              value={shieldAmt}
              onChange={(e) => setShieldAmt(e.target.value)}
            />
            <button
              disabled={busy || !(Number(shieldAmt) > 0)}
              onClick={() => shield(account, shieldAmt)}
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Shield
            </button>
            <input
              className="w-32 rounded-md bg-slate-800 px-3 py-2 text-sm"
              placeholder="Unwrap eUSDG"
              inputMode="decimal"
              value={unshieldAmt}
              onChange={(e) => setUnshieldAmt(e.target.value)}
            />
            <button
              disabled={busy || !(Number(unshieldAmt) > 0)}
              onClick={unshield}
              className="rounded-md bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600 disabled:opacity-40"
            >
              Unshield
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Unshielding reveals the amount on-chain. Shielding is public too.
          </p>
        </section>
      )}

      {account && (
        <form
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validCreate) create();
          }}
        >
          <h2 className="font-semibold">Start a private campaign</h2>
          <CampaignFields value={info} onChange={setInfo} />
          <div className="flex flex-wrap gap-3">
            <input
              className="w-40 rounded-md bg-slate-800 px-3 py-2 text-sm"
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
              disabled={!validCreate || busy}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Create
            </button>
          </div>
          <p className="text-xs text-slate-500">
            The goal is public so the contract can compare it against the
            encrypted total.
          </p>
        </form>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Private campaigns</h2>
        {campaigns.length === 0 && (
          <p className="text-sm text-slate-500">No campaigns yet.</p>
        )}
        {campaigns.map((c) => (
          <PrivateCard
            key={c.id.toString()}
            c={c}
            account={account}
            busy={busy}
            receipts={receipts.filter((r) => r.campaignId === c.id.toString())}
            refunded={refunded}
            revealed={revealed}
            onDonate={donate}
            onRefund={refund}
            onWithdraw={withdraw}
            onRevealDonation={revealDonation}
            onRevealTotal={revealTotal}
          />
        ))}
      </section>
    </div>
  );
}

function PrivateCard(props: {
  c: PCampaign;
  account: Address | null;
  busy: boolean;
  receipts: Receipt[];
  refunded: Record<string, boolean>;
  revealed: Record<string, string>;
  onDonate: (c: PCampaign, amount: string, refundTo: Address) => void;
  onRefund: (r: Receipt) => void;
  onWithdraw: (c: PCampaign) => void;
  onRevealDonation: (r: Receipt) => void;
  onRevealTotal: (c: PCampaign) => void;
}) {
  const { c, account, busy, receipts, refunded, revealed } = props;
  const [amount, setAmount] = useState("");
  const [custom, setCustom] = useState("");
  const [useFresh, setUseFresh] = useState(false);

  const ended = nowSec() >= c.deadline;
  const isCreator =
    !!account && account.toLowerCase() === c.creator.toLowerCase();
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
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            ended
              ? "bg-slate-500/20 text-slate-300"
              : "bg-sky-500/20 text-sky-300"
          }`}
        >
          {ended ? (c.withdrawn ? "Settled" : "Ended") : "Active"}
        </span>
      </div>
      <div className="mb-1 text-sm text-slate-300">
        Goal {fmt(c.goal)} USDG · raised{" "}
        <span className="text-slate-400">
          {revealed[`t${c.id}`] ?? "🔒 encrypted"}
        </span>
      </div>
      <div className="mb-3 text-xs text-slate-500">
        {ended ? "Ended" : "Ends"}{" "}
        {new Date(Number(c.deadline) * 1000).toLocaleString()} · creator{" "}
        <span className="font-mono">{shortAddr(c.creator)}</span> ·{" "}
        {c.donationCount.toString()} donations
      </div>

      {!ended && account && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
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
              Donate privately
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

      {isCreator && ended && !c.withdrawn && (
        <button
          disabled={busy}
          onClick={() => props.onWithdraw(c)}
          className="mt-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          Settle and withdraw
        </button>
      )}
      {isCreator && ended && c.withdrawn && (
        <button
          disabled={busy}
          onClick={() => props.onRevealTotal(c)}
          className="mt-2 text-xs text-sky-300 hover:underline disabled:opacity-50"
        >
          Reveal total
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
                    {revealed[`d${r.secret}`] ?? "🔒 encrypted"}{" "}
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
                    {!pending && (
                      <button
                        disabled={busy}
                        onClick={() => props.onRevealDonation(r)}
                        className="text-xs text-sky-300 hover:underline disabled:opacity-50"
                      >
                        Reveal
                      </button>
                    )}
                    {!pending && !done && (
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
            After the deadline, a refund on a funded campaign pays 0 and cannot
            be repeated. The contract cannot tell whether the goal was met
            without decrypting, so it settles the check on encrypted values.
          </p>
        </div>
      )}
    </article>
  );
}
