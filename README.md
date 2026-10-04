# Sod

**Trustless, privacy-minded crowdfunding on Arbitrum.**

Sod is a GoFundMe-style platform where a smart contract, not a company, enforces the goal, the deadline, and refunds. Donors can take their money back before the deadline, and creators can only withdraw if the goal is met. A privacy layer (encrypted amounts with Fhenix FHE, gasless donations with ZeroDev) is built in stages on top of that core.

> **Status: hackathon prototype for Arbitrum Open House Singapore (Online Buildathon).**
> Phase 1 is the core. Phases 2 and 3 are the privacy roadmap. Read [Privacy: what is and isn't hidden](#privacy-what-is-and-isnt-hidden) before trusting Sod with anything sensitive. Testnet only, not audited.

---

## Why Sod

People who give to sensitive causes (activism, legal defense, medical bills, journalism) often don't want their giving public. Centralized platforms can freeze campaigns or accounts, and transparent chains expose every donor and every amount.

Sod moves the rules into a contract nobody can override, then adds privacy in layers:

| Problem | Sod's approach |
|---|---|
| Platform can freeze or keep funds | Contract-enforced escrow: no admin can move campaign funds |
| Donor has no way out | Refund before the deadline, plus automatic refunds if the goal fails |
| Refund can be hijacked | Refund is bound to a secret and a destination address (front-run proof) |
| Amounts are public | Encrypted amounts with Fhenix FHE (Phase 2) |
| Gas funding links wallets | Sponsored gas with ZeroDev (Phase 3) |

---

## How it works

### Actors

- **Donor** gives stablecoins (or confidential tokens in Phase 2) to a campaign.
- **Creator** starts a campaign and withdraws if the goal is met.
- **Contract** holds the funds and enforces every rule.

### Campaign lifecycle

1. **Create.** Creator calls `createCampaign(goal, deadline)`.
2. **Donate.** Donor generates a one-time `refundSecret` in the browser, computes a commitment, and calls `donate(campaignId, amount, commitment)`. The secret never leaves the browser until a refund.
3. **Refund before the deadline.** Donor reveals `refundSecret` and a `refundTo` address. The contract checks the commitment and returns the funds.
4. **Settle at the deadline.**
   - **Goal met:** the creator calls `withdraw(campaignId)` once.
   - **Goal not met:** every donor can claim a refund through the same `refund` function.

### Front-run-proof refunds

The commitment binds the secret to a specific destination:

```
commitment = keccak256(abi.encode(campaignId, refundSecret, refundTo))
```

Because `refundTo` is inside the hash, someone who copies the secret from the mempool cannot redirect the refund to their own address. Donors can also refund to a fresh address.

---

## Architecture

```
Donor browser                         Arbitrum
┌──────────────────┐   donate()    ┌───────────────────────────┐
│ React + Tailwind │──────────────▶│ SodCrowdfund              │
│  - secret gen    │   refund()    │  - OpenZeppelin:          │
│  - commitment    │──────────────▶│    SafeERC20,             │
│  - FHE encrypt   │               │    ReentrancyGuard,       │
│    (Phase 2)     │   withdraw()  │    Pausable (emergency)   │
└────────┬─────────┘◀──────────────│  - goal / deadline rules  │
         │                         └─────────────┬─────────────┘
         │ sponsored UserOps (Phase 3)           │ encrypted math (Phase 2)
         ▼                                       ▼
┌──────────────────┐                   ┌───────────────────────┐
│ ZeroDev Kernel   │                   │ Fhenix CoFHE          │
│ smart account    │                   │  euint64 totals       │
│ + paymaster      │                   │  FHE.add / FHE.gte    │
└──────────────────┘                   └───────────────────────┘
```

### Components

| Component | Role |
|---|---|
| `SodCrowdfund.sol` | Campaigns, donations, refunds, withdrawals |
| `MockUSDC.sol` | Test token for Arbitrum Sepolia |
| React + Tailwind frontend | Create campaigns, donate, refund, withdraw |
| Hardhat | Compile, test, deploy |
| OpenZeppelin | Audited building blocks for the contract |
| ZeroDev (Phase 3) | Gas-sponsored smart accounts |
| Fhenix CoFHE (Phase 2) | Encrypted amounts and totals |

---

## Phases

### Phase 1: Core (the part to ship first)

A fully working, fully public, trustless crowdfund.

- USDC escrow with goal and deadline
- Commitment-based, front-run-proof refunds
- Creator withdrawal only after the deadline and only if the goal is met
- OpenZeppelin `SafeERC20` for token transfers, `ReentrancyGuard` on every function that moves funds
- Hardhat test suite

### Phase 2: Encrypted amounts (Fhenix FHE)

Hide how much each donor gave and the running total.

1. The donor wraps a **large** amount of USDC into a confidential (FHERC20-style) token. The wrap is public, so wrapping more than you donate keeps the real donation hidden.
2. The browser encrypts the donation amount with the CoFHE client SDK (`@cofhe/sdk`).
3. The contract stores amounts as `euint64` and aggregates with `FHE.add`.
4. The goal check uses `FHE.gte(total, goal)`, which returns an encrypted boolean.
5. Settlement avoids decrypting where possible:
   - Creator payout: `FHE.select(goalMet, total, 0)`
   - Donor refund: `FHE.select(goalMet, 0, donation)`
6. `FHE.allow(...)` lets each donor read only their own amount, and the creator read the total after settlement.

The alternative is an asynchronous decrypt of the goal-met flag, which makes withdrawal a two-step flow.

### Phase 3: Gasless donations (ZeroDev)

Remove the gas-funding link between wallets.

- Each donation comes from a fresh ZeroDev **Kernel** smart account, owned by a fresh EOA created in the browser.
- A ZeroDev paymaster sponsors the gas, so the fresh account never needs ETH from a wallet tied to the donor.
- Donations go out as ERC-4337 UserOperations.

---

## Privacy: what is and isn't hidden

Be honest with donors about this table.

| Property | Phase 1 | Phase 2 (FHE) | Phase 3 (+ ZeroDev) |
|---|---|---|---|
| Donation amount | Public | Hidden, if the donor wrapped more than they donated | Same as Phase 2 |
| Running total | Public | Hidden until settlement | Same as Phase 2 |
| Donor address | **Public** | **Public** | Harder to link, **not unlinkable** |
| Gas-funding link | Visible | Visible | Removed by the paymaster |
| Token funding link | Visible | Visible | Still visible: the fresh account has to receive tokens from somewhere |
| Creator payout address | Public | Public | Public |

**Sod does not make donors anonymous.** FHE hides numbers, not who sent a transaction. True donor unlinkability needs a ZK pool (Semaphore or Tornado-style) or an existing privacy protocol, and is on the roadmap below.

---

## Tech stack

- **Chain:** Arbitrum (Arbitrum Sepolia for the demo, plus Robinhood Chain testnet if time allows)
- **Contracts:** Solidity, Hardhat, OpenZeppelin Contracts v5
- **Privacy:** Fhenix CoFHE (`@fhenixprotocol/cofhe-contracts`, `@cofhe/sdk`, `@cofhe/hardhat-plugin` for tests)
- **Account abstraction:** ZeroDev (`@zerodev/sdk`, `@zerodev/ecdsa-validator`) with `viem`
- **Frontend:** React, Tailwind CSS, wagmi/viem
- **Tests:** Hardhat with Chai (Hardhat network)

Package names and APIs for Fhenix and ZeroDev change often. Check their current docs (cofhe-docs.fhenix.zone and docs.zerodev.app) before installing.

---

## Sponsor tools used

Only tick on the submission form what is actually integrated.

| Sponsor | How Sod uses it | Phase |
|---|---|---|
| **OpenZeppelin** | `SafeERC20`, `ReentrancyGuard`, `Pausable`, and `Ownable` or `AccessControl` for the emergency pause | 1 |
| **Fhenix** | Encrypted donation amounts, encrypted totals, goal check | 2 |
| **ZeroDev** | Kernel smart accounts and gas sponsorship | 3 |

---

## Getting started

```bash
git clone <your-repo-url> sod && cd sod
npm install

# contracts
npx hardhat compile
npx hardhat test

# deploy (Arbitrum Sepolia)
cp .env.example .env     # add PRIVATE_KEY and ARBITRUM_SEPOLIA_RPC
npx hardhat run scripts/deploy.ts --network arbitrumSepolia

# frontend
cd frontend && npm install && npm run dev
```

If `binaries.soliditylang.org` is blocked on your network, compile with the solc-js package instead: `SOLCJS=1 npx hardhat test`.

The frontend reads addresses from `frontend/src/contracts/deployment.json` (written by the deploy script) or from `VITE_SOD_ADDRESS` / `VITE_TOKEN_ADDRESS`. It talks to the chain with viem and an injected wallet (no wagmi).


## Build status

| Piece | State |
|---|---|
| Phase 1 contract, tests, frontend | Built. Tests pass. |
| Phase 2 contracts | Built. 20 tests pass on the CoFHE **mock** contracts (hardhat network), including unshield and access-control checks. |
| Phase 2 frontend (shield, encrypt, donate, reveal, unshield) | Built, typechecks and bundles. **Not run against the live CoFHE testnet.** |
| Phase 3 gasless donation (Kernel account + paymaster) | Built, typechecks and bundles. **Not run against ZeroDev or a bundler.** Needs `VITE_ZERODEV_RPC`. |

The mocks do not exercise the real CoFHE network, the real ZK input proof, or ZeroDev. Do a full donate, reveal, refund and withdraw loop on Arbitrum Sepolia before you submit, and tick only what works on the sponsor form.

Things the real libraries taught us, which differ from earlier assumptions in this README:

- Fhenix's client SDK calls decryption permits **ACPs** (`client.acp`), and the default lifetime is 7 days.
- Encrypted inputs are passed as `(bytes32 handle, bytes proof)`, which is `externalEuint64` plus `bytes` in Solidity. Confidential token transfers between contracts use `sharedEuint64`.
- `ConfidentialUSDC` depends on a linked library, `ERC20ConfidentialLib`. `scripts/deploy.ts` deploys and links it.
- The SDK lets you set the encrypting account explicitly (`.setAccount(...)`), so a smart account does not need to sign anything to receive an encrypted donation input. Decrypting is the part that needs an EOA, hence the `viewer` address.

### Phase 2 behaviour worth knowing

- The encrypted total is **frozen at the deadline**. Only refunds made before the deadline reduce it. Without this, a creator payout could make a later refund see a total of zero and pay out of the shared token pool.
- After the deadline, a refund on a funded campaign pays 0 and still marks the donation refunded. The contract cannot tell whether the goal was met without decrypting, so it settles on encrypted values.
- A donor who asks to donate more than they hold silently donates 0 (FHERC20 zero-replacement). The contract records what actually moved.
- Creators cash out with `unshield`, then a decryption claim, then `claimUnshielded`. The frontend has an Unshield button that runs all three steps.

## Environment variables

Root `.env`: `PRIVATE_KEY`, `ARBITRUM_SEPOLIA_RPC`. Optional: `TOKEN_ADDRESS` (use an existing ERC-20), `SKIP_CONFIDENTIAL=1`.

`frontend/.env`: `VITE_SOD_ADDRESS`, `VITE_TOKEN_ADDRESS`, `VITE_SOD_CONF_ADDRESS`, `VITE_ECUSDC_ADDRESS` (all optional if the deploy script wrote `deployment.json`), and `VITE_ZERODEV_RPC` for Phase 3, in the form `https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/421614`.

### Suggested project layout

```
sod/
├── contracts/
│   ├── SodCrowdfund.sol                # Phase 1
│   ├── SodConfidentialCrowdfund.sol    # Phase 2 (FHE)
│   ├── ConfidentialUSDC.sol            # FHERC20 wrapper of the ERC-20
│   └── mocks/MockUSDC.sol
├── test/
│   ├── SodCrowdfund.test.ts
│   └── SodConfidentialCrowdfund.test.ts
├── scripts/deploy.ts
├── hardhat.config.ts
└── frontend/            # React + Tailwind (viem, @cofhe/sdk, @zerodev/sdk)
```

---

## Contract interface (Phase 1)

| Function | Who | Rule |
|---|---|---|
| `createCampaign(goal, deadline)` | Anyone | Deadline must be in the future |
| `donate(id, amount, commitment)` | Anyone | Before the deadline; pulls USDC with `SafeERC20` |
| `refund(id, donationIndex, secret, refundTo)` | Anyone with the secret | Valid before the deadline, or after the deadline if the goal failed. Commitment must match. Once only |
| `withdraw(id)` | Creator only | After the deadline, goal met, once only |

Every function that moves funds is `nonReentrant`, and state is updated before transfers (checks-effects-interactions).

---

## Tests

The test suite covers:

- Successful campaign: donate, pass the deadline, creator withdraws the full total
- Failed campaign: every donor can refund after the deadline
- Refund before the deadline reduces the total
- Wrong secret is rejected
- Wrong `refundTo` is rejected (front-run protection)
- Double refund is blocked
- Early withdrawal is blocked
- Non-creator withdrawal is blocked
- Double withdrawal is blocked
- Donating after the deadline is blocked

Run with `npx hardhat test`.

---

## Limitations

Read these before trusting Sod with real funds.

- **Not audited.** Testnet prototype only.
- **Donor addresses are public** in every phase. Sod hides amounts (Phase 2), not identities.
- **Wrapping into the confidential token is public.** Privacy depends on wrapping more than you donate and on a large enough crowd. With only a few donors, timing and sizes can narrow things down.
- **ZeroDev plus Fhenix compatibility is unverified.** Fhenix permits are EIP-712 signatures, and a Kernel account signs with ERC-1271 contract signatures. It is not confirmed that CoFHE accepts those. Planned workaround: a separate `viewer` EOA is granted decrypt rights via `FHE.allow(...)` and signs the permit instead. Test this early.
- **Unwrapping reveals the amount** when the creator converts confidential tokens back to USDC.
- **Gas costs and latency** are higher for FHE operations, and decryption is asynchronous.
- **No campaign or identity verification.** Fraud and compliance risks apply. Crypto fundraising rules vary by country, so this is not legal advice.
- **Emergency pause.** If a pause role exists, it must never be able to move campaign funds, only stop new donations.

---

## Roadmap

- [x] Phase 1: `SodCrowdfund` contract, mock token, and test suite
- [x] Phase 1: React + Tailwind frontend (create, donate, refund, withdraw)
- [ ] Phase 1: Deploy to Arbitrum Sepolia (and Robinhood Chain testnet)
- [x] Phase 2: Confidential token integration and encrypted totals (`SodConfidentialCrowdfund` + `ConfidentialUSDC`)
- [x] Phase 2: `FHE.select`-based settlement
- [x] Phase 3: ZeroDev Kernel accounts and paymaster sponsorship (frontend flow; needs a live test, see Status below)
- [x] Phase 3: Workaround for smart-account permit signing: `viewer` address on `donate` (contract tested; end-to-end with a real Kernel account still to verify)
- [ ] Donor unlinkability via a ZK pool or an existing privacy protocol
- [ ] Campaign verification and creator reputation
- [ ] Third-party audit before any mainnet use

---

## License

MIT