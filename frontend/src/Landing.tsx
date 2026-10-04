import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import {
  SOD_ADDRESS,
  TOKEN_DECIMALS,
  isConfigured,
  sodAbi,
} from "./lib/contracts";
import { publicClient } from "./lib/wallet";
import {
  Icon,
  Logo,
  SceneCommunity,
  SceneEducation,
  SceneHero,
  SceneMedical,
  SceneWater,
} from "./art";

const APP = "#/app";

function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function useStats() {
  const [s, setS] = useState<{ campaigns: number; donations: number; raised: number } | null>(null);
  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    (async () => {
      try {
        const count = Number(
          (await publicClient.readContract({
            address: SOD_ADDRESS,
            abi: sodAbi,
            functionName: "campaignCount",
          })) as bigint,
        );
        const rows = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            publicClient.readContract({
              address: SOD_ADDRESS,
              abi: sodAbi,
              functionName: "campaigns",
              args: [BigInt(i)],
            }) as Promise<readonly [string, bigint, bigint, boolean, bigint, bigint]>,
          ),
        );
        const raised = rows.reduce((a, r) => a + r[4], 0n);
        const donations = rows.reduce((a, r) => a + Number(r[5]), 0);
        if (alive)
          setS({
            campaigns: count,
            donations,
            raised: Number(formatUnits(raised, TOKEN_DECIMALS)),
          });
      } catch {
        /* stats are decorative; stay hidden if the network is unreachable */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

function Button({
  href,
  onClick,
  children,
  variant = "primary",
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: "primary" | "secondary" | "light";
}) {
  const styles = {
    primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
    secondary: "border border-ink/15 bg-white text-ink hover:border-ink/40",
    light: "bg-white text-brand-700 hover:bg-brand-50",
  }[variant];
  const cls = `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 ${styles}`;
  return href ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-brand-700">
      {children}
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [
    ["how", "How it works"],
    ["trust", "Why Sod"],
    ["use-cases", "Use cases"],
    ["privacy", "Privacy"],
    ["faq", "FAQ"],
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#/" className="flex items-center gap-2.5" onClick={() => window.scrollTo(0, 0)}>
          <Logo />
          <span className="text-xl font-extrabold tracking-tight text-ink">Sod</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([id, label]) => (
            <button
              key={id}
              onClick={() => go(id)}
              className="text-[15px] font-medium text-ink/70 hover:text-ink"
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={APP}
            className="hidden rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-block"
          >
            Launch app
          </a>
          <button
            aria-label="Menu"
            className="rounded-lg p-2 text-ink md:hidden"
            onClick={() => setOpen(!open)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-ink/10 bg-white px-5 pb-5 pt-2 md:hidden">
          {links.map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setOpen(false);
                go(id);
              }}
              className="block w-full py-3 text-left text-base font-medium text-ink"
            >
              {label}
            </button>
          ))}
          <a href={APP} className="mt-2 block rounded-full bg-brand-600 py-3 text-center font-semibold text-white">
            Launch app
          </a>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-cream">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-600/20 bg-white px-3.5 py-1.5 text-sm font-medium text-brand-700">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Live on Arbitrum Sepolia testnet
          </div>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Fundraising you can trust,{" "}
            <span className="text-brand-600">enforced by code.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/70">
            Every donation is held by a smart contract, not a company. Reach the
            goal and the organizer is paid. Miss it and every donor can take
            their money back. Sign in with Google or a passkey. No crypto
            experience needed.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href={APP}>
              Start a campaign <Icon.Arrow width={18} height={18} />
            </Button>
            <Button href={APP} variant="secondary">
              Browse campaigns
            </Button>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-ink/70">
            {["Refund if the goal is missed", "Contract takes no cut", "Optional private amounts"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Icon.Check width={18} height={18} className="text-brand-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="overflow-hidden rounded-[2rem] shadow-card">
            <SceneHero className="block aspect-[4/3.4] w-full" />
          </div>
          <div className="absolute -bottom-8 -left-3 w-64 rounded-2xl bg-white p-4 shadow-float sm:-left-8">
            <div className="flex items-center justify-between text-xs font-semibold text-ink/50">
              <span>EXAMPLE CAMPAIGN</span>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Active</span>
            </div>
            <div className="mt-2 text-sm font-bold text-ink">Library for Ikorodu Primary</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-[78%] rounded-full bg-brand-500" />
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink/60">
              <span><b className="text-ink">3,900</b> of 5,000 USDG</span>
              <span>78%</span>
            </div>
          </div>
          <div className="absolute -right-2 top-8 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-float sm:-right-6">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Icon.Refund />
            </span>
            <div>
              <div className="text-sm font-bold text-ink">Refund protection</div>
              <div className="text-xs text-ink/60">Built into the contract</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatStrip() {
  const s = useStats();
  if (!s) return null;
  const items = [
    [s.campaigns.toLocaleString(), "campaigns created"],
    [s.donations.toLocaleString(), "donations made"],
    [s.raised.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " USDG", "pledged on testnet"],
  ];
  return (
    <section className="border-y border-ink/10 bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 text-center sm:grid-cols-3">
        {items.map(([v, l]) => (
          <div key={l}>
            <div className="text-3xl font-extrabold tracking-tight text-ink">{v}</div>
            <div className="mt-1 text-sm text-ink/60">{l}</div>
          </div>
        ))}
        <p className="text-xs text-ink/40 sm:col-span-3">
          Read live from the Sod contract on Arbitrum Sepolia. Test tokens only, no real money.
        </p>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    {
      icon: <Icon.User width={26} height={26} />,
      title: "Sign in in seconds",
      body: "Use Google, a passkey or email. A secure wallet is created for you in the background, so there are no seed phrases to learn.",
    },
    {
      icon: <Icon.Rocket width={26} height={26} />,
      title: "Start or back a campaign",
      body: "Organizers set a story, a goal and a deadline. Donors choose an amount and give. The money goes to the contract, not to a person.",
    },
    {
      icon: <Icon.Heart width={26} height={26} />,
      title: "Funds go where they should",
      body: "Goal reached by the deadline? The organizer withdraws. Goal missed? Donors reclaim their full donation. Nobody has to be asked nicely.",
    },
  ];
  return (
    <section id="how" className="scroll-mt-16 bg-white py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-4xl font-extrabold tracking-tight text-ink">
            Three steps from idea to funded
          </h2>
          <p className="mt-4 text-lg text-ink/70">
            The familiar crowdfunding flow, with the trust handled by software
            that anyone can inspect.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative rounded-3xl border border-ink/10 bg-cream p-8">
              <div className="mb-6 flex items-center justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-brand-700 shadow-sm">
                  {s.icon}
                </span>
                <span className="text-5xl font-extrabold text-ink/10">0{i + 1}</span>
              </div>
              <h3 className="text-xl font-bold text-ink">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink/70">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    {
      icon: <Icon.Refund width={24} height={24} />,
      title: "Automatic refund protection",
      body: "If a campaign ends below its goal, every donation can be refunded in full. Donors can also pull out before the deadline.",
    },
    {
      icon: <Icon.Lock width={24} height={24} />,
      title: "Funds are locked until the goal is met",
      body: "Organizers cannot touch the money early. Withdrawal only unlocks after the deadline, and only if the goal was reached.",
    },
    {
      icon: <Icon.Key width={24} height={24} />,
      title: "No wallet knowledge needed",
      body: "Sign in with Google, a passkey or email. Prefer your own wallet? MetaMask and other installed wallets work too.",
    },
    {
      icon: <Icon.Eye width={24} height={24} />,
      title: "Every rule is public",
      body: "Goals, deadlines and totals live on-chain. Anyone can verify what was raised and where it went, with no company to take on faith.",
    },
  ];
  return (
    <section id="trust" className="scroll-mt-16 bg-ink py-24 text-white">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid items-end gap-6 md:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-brand-500">
              Why Sod
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight">
              Trust shouldn't depend on a stranger's word
            </h2>
          </div>
          <p className="text-lg text-white/70">
            Traditional platforms ask you to trust the organizer and the
            company. Sod replaces that with rules the contract enforces for
            everyone, every time.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
              <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-brand-500/15 text-brand-500">
                {it.icon}
              </span>
              <h3 className="text-xl font-bold">{it.title}</h3>
              <p className="mt-3 leading-relaxed text-white/70">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {
      Art: SceneEducation,
      tag: "Education",
      title: "Fund a school library",
      story:
        "A teacher needs 5,000 USDG for books and shelves. Parents and alumni give small amounts from different countries. The doors open only once the full amount is pledged.",
      point: "Donors know the money is spent on books or returned.",
    },
    {
      Art: SceneMedical,
      tag: "Medical",
      title: "Cover an urgent treatment",
      story:
        "A family raises money for surgery with a hard deadline. If the target isn't reached, no one is left out of pocket and donors can redirect their giving.",
      point: "Refunds go to a different address if a donor wants one.",
    },
    {
      Art: SceneWater,
      tag: "Clean water",
      title: "Dig a village well",
      story:
        "A community group raises for a borehole. Backers can follow the running total on-chain, and the group is paid only if the whole project is covered.",
      point: "A transparent total anyone can verify.",
    },
    {
      Art: SceneCommunity,
      tag: "Community",
      title: "Rebuild after a flood",
      story:
        "Neighbors pool funds to repair homes. Donors who prefer not to broadcast how much they gave can use private mode, where amounts stay encrypted.",
      point: "Give generously without publishing the number.",
    },
  ];
  return (
    <section id="use-cases" className="scroll-mt-16 bg-cream py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Real-world use cases</Eyebrow>
          <h2 className="text-4xl font-extrabold tracking-tight text-ink">
            Built for causes that need confidence
          </h2>
          <p className="mt-4 text-lg text-ink/70">
            Any all-or-nothing fundraiser works better when backers can see the
            rules in advance.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {cases.map(({ Art, tag, title, story, point }) => (
            <article key={title} className="group overflow-hidden rounded-3xl bg-white shadow-card">
              <div className="relative overflow-hidden">
                <Art className="block aspect-[16/9] w-full transition duration-500 group-hover:scale-[1.03]" />
                <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                  {tag}
                </span>
              </div>
              <div className="p-7">
                <h3 className="text-2xl font-bold text-ink">{title}</h3>
                <p className="mt-3 leading-relaxed text-ink/70">{story}</p>
                <div className="mt-5 flex items-start gap-2 rounded-xl bg-brand-50 p-3.5 text-sm font-medium text-brand-900">
                  <Icon.Check width={18} height={18} className="mt-0.5 shrink-0 text-brand-600" />
                  {point}
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-ink/50">
          Scenarios are illustrative examples of how Sod works, not real campaigns.
        </p>
      </div>
    </section>
  );
}

function Walkthrough() {
  const paths = [
    {
      tone: "bg-brand-50 border-brand-600/20",
      chip: "bg-brand-600 text-white",
      label: "Goal reached",
      steps: [
        "Day 1: Amara opens a 5,000 USDG campaign for a school library, ending in 30 days.",
        "Day 12: Chidi donates 50 USDG. The contract holds it and gives him a refund receipt.",
        "Day 30: The total hits 5,100. The deadline passes.",
        "Amara withdraws the full amount from the contract. No one else can.",
      ],
    },
    {
      tone: "bg-amber-50 border-amber-500/30",
      chip: "bg-amber-600 text-white",
      label: "Goal missed",
      steps: [
        "Same campaign, same 50 USDG donation from Chidi on day 12.",
        "Day 30: The total reaches only 3,200. The deadline passes.",
        "The campaign is marked failed and refunds open automatically.",
        "Chidi uses his receipt and gets all 50 USDG back, to any address he chooses.",
      ],
    },
  ];
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Follow a donation</Eyebrow>
          <h2 className="text-4xl font-extrabold tracking-tight text-ink">
            One donation, two possible endings
          </h2>
          <p className="mt-4 text-lg text-ink/70">
            Either way, the donor is protected and the outcome is decided by the
            deadline, not by anyone's discretion.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {paths.map((p) => (
            <div key={p.label} className={`rounded-3xl border p-8 ${p.tone}`}>
              <span className={`inline-block rounded-full px-3.5 py-1 text-sm font-bold ${p.chip}`}>
                {p.label}
              </span>
              <ol className="mt-6 space-y-5">
                {p.steps.map((t, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-ink shadow-sm">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed text-ink/80">{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-ink/50">
          Names and amounts are fictional, used to illustrate the flow.
        </p>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-16 bg-cream py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        <div>
          <Eyebrow>Private mode</Eyebrow>
          <h2 className="text-4xl font-extrabold tracking-tight text-ink">
            Give without announcing how much
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink/70">
            In private campaigns, donation amounts and the running total are
            encrypted using fully homomorphic encryption. The contract can still
            check the goal and enforce refunds without ever revealing a
            donor's number.
          </p>
          <p className="mt-4 leading-relaxed text-ink/70">
            We're upfront about the limits: private mode hides amounts, not
            people. Wallet addresses stay visible, and wrapping tokens into
            their confidential form is a public step.
          </p>
          <div className="mt-8">
            <Button href={APP}>Try private mode</Button>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-card">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="mb-4 flex items-center gap-2 font-bold text-brand-700">
                <Icon.EyeOff width={20} height={20} /> Encrypted
              </div>
              <ul className="space-y-3 text-sm text-ink/80">
                {["Each donation amount", "The running total", "Your confidential balance"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Icon.Lock width={16} height={16} className="text-brand-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-4 flex items-center gap-2 font-bold text-ink/70">
                <Icon.Eye width={20} height={20} /> Still public
              </div>
              <ul className="space-y-3 text-sm text-ink/70">
                {["Donor addresses", "Goal and deadline", "Refund events"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink/30" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 rounded-2xl bg-ink p-5 font-mono text-xs leading-relaxed text-white/80">
            <div className="text-white/40">// what an observer sees</div>
            <div>donated(campaign: 3, donor: 0x7a…c1f2,</div>
            <div className="pl-4">amount: <span className="text-brand-500">0x9f3b…e21a</span>)</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qs: [string, string][] = [
    [
      "Do I need to know anything about crypto?",
      "No. You sign in with Google, a passkey or email and a wallet is created for you. If you already use MetaMask or another wallet, you can connect that instead.",
    ],
    [
      "What happens if a campaign doesn't reach its goal?",
      "It is marked failed after the deadline and refunds open. Each donor reclaims their donation using the receipt saved when they gave. You can also send the refund to a different address.",
    ],
    [
      "Can the organizer take the money early?",
      "No. The contract only lets the creator withdraw after the deadline, and only if the goal has been reached.",
    ],
    [
      "What is a donation receipt and why back it up?",
      "When you donate, a secret is stored in your browser that proves the donation is yours. Back it up from the app so you can request a refund from another device.",
    ],
    [
      "What currency does it use?",
      "Sod currently runs on the Arbitrum Sepolia testnet using test USDG. You can get free test tokens from the faucet. No real money is involved.",
    ],
    [
      "Is it audited and ready for real funds?",
      "Not yet. Sod is a testnet prototype and has not been security audited. Please don't use it with real money until that changes.",
    ],
  ];
  return (
    <section id="faq" className="scroll-mt-16 bg-white py-24">
      <div className="mx-auto max-w-3xl px-5">
        <div className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-4xl font-extrabold tracking-tight text-ink">Questions, answered</h2>
        </div>
        <div className="mt-12 divide-y divide-ink/10 rounded-3xl border border-ink/10">
          {qs.map(([q, a]) => (
            <details key={q} className="group px-7 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-ink">
                {q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cream text-xl text-brand-700 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 leading-relaxed text-ink/70">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="bg-white px-5 pb-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-700 px-8 py-16 text-center text-white">
        <h2 className="mx-auto max-w-2xl text-4xl font-extrabold tracking-tight">
          Ready to raise money people can trust?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
          Launch the app, sign in, and start your first campaign or back
          someone else's in under a minute.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={APP} variant="light">
            Launch app <Icon.Arrow width={18} height={18} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-cream">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-extrabold text-ink">Sod</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink/60">
            Trustless crowdfunding on Arbitrum. Funds held by a contract, refunds
            guaranteed by code.
          </p>
        </div>
        <div className="max-w-md text-sm leading-relaxed text-ink/50">
          <b className="text-ink/70">Testnet prototype.</b> Not audited. Uses test
          tokens with no monetary value. Public campaigns are fully transparent:
          donor addresses and amounts are visible on-chain, and Sod does not make
          donors anonymous.
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="font-sans text-ink">
      <Nav />
      <Hero />
      <StatStrip />
      <How />
      <Trust />
      <UseCases />
      <Walkthrough />
      <Privacy />
      <Faq />
      <Cta />
      <Footer />
    </div>
  );
}
