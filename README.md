# Sod

**Trustless, private crowdfunding on Arbitrum.**

Sod is a GoFundMe-style platform where a smart contract, not a company, enforces the goal, the deadline, and refunds. Donors can take their money back before the deadline, and creators can only withdraw if the goal is met. Donation amounts are encrypted with Fhenix FHE, and donations are gasless with ZeroDev.

Campaigns are funded in **USDG** (Global Dollar, issued by Paxos).

> **Status: hackathon project for Arbitrum Open House Singapore (Online Buildathon).**
> Testnet only, not audited. Read [Privacy: what is and isn’t hidden](#privacy-what-is-and-isnt-hidden) before trusting Sod with anything sensitive.

---

## Why Sod

People who give to sensitive causes (activism, legal defense, medical bills, journalism) often don’t want their giving public. Centralized platforms can freeze campaigns or accounts, and transparent chains expose every donor and every amount.

Sod moves the rules into a contract nobody can override, then hides the numbers and the gas trail.

| Problem                           | Sod’s approach                                                          |
| --------------------------------- | ----------------------------------------------------------------------- |
| Platform can freeze or keep funds | Contract-enforced escrow: no admin can move campaign funds              |
| Donor has no way out              | Refund before the deadline, plus automatic refunds if the goal fails    |
| Refund can be hijacked            | Refund is bound to a secret and a destination address (front-run proof) |
| Amounts are public                | Encrypted amounts and totals with Fhenix FHE                            |
| Gas funding links wallets         | Sponsored gas with ZeroDev                                              |

---

## How it works

### Actors

- **Donor** gives confidential USDG to a campaign.
- **Creator** starts a campaign and withdraws if the goal is met.
- **Contract** holds the funds and enforces every rule.

### Campaign lifecycle

1. **Create.** Creator calls `createCampaign(goal, deadline)`. The goal is in USDG base units (6 decimals).
1. **Shield.** Donor wraps USDG into a confidential (FHERC20-style) token, eUSDG. The wrap is public, so wrapping more than you donate keeps the real donation hidden.
1. **Donate.** Donor generates a one-time `refundSecret` in the browser, computes a commitment, encrypts the amount with the CoFHE client SDK, and donates from a fresh ZeroDev Kernel smart account with sponsored gas. The secret never leaves the browser until a refund.
1. **Refund before the deadline.** Donor reveals `refundSecret` and a `refundTo` address. The contract checks the commitment and returns the funds.
1. **Settle at the deadline.**

- **Goal met:** the creator withdraws once.
- **Goal not met:** every donor can claim a refund through the same `refund` function.

1. **Cash out.** Creators convert confidential tokens back to USDG with `unshield`, then a decryption claim, then `claimUnshielded`. The frontend has an Unshield button that runs all three steps.

### Front-run-proof refunds

The commitment binds the secret to a specific destination:

```
commitment = keccak256(abi.encode(campaignId, refundSecret, refundTo))
```

Because `refundTo` is inside the hash, someone who copies the secret from the mempool cannot redirect the refund to their own address. Donors can also refund to a fresh address.

### Encrypted amounts (Fhenix FHE)

- Amounts are stored as `euint64` and aggregated with `FHE.add`.
- The goal check uses `FHE.gte(total, goal)`, which returns an encrypted boolean.
- Settlement avoids decrypting where possible:
  - Creator payout: `FHE.select(goalMet, total, 0)`
  - Donor refund: `FHE.select(goalMet, 0, donation)`
- `FHE.allow(...)` lets each donor read only their own amount, and the creator read the total after settlement.

### Gasless donations (ZeroDev)

- Each donation comes from a fresh ZeroDev **Kernel** smart account, owned by a fresh EOA created in the browser.
- A ZeroDev paymaster sponsors the gas, so the fresh account never needs ETH from a wallet tied to the donor.
- Donations go out as ERC-4337 UserOperations.
- Fhenix permits are EIP-712 signatures, and a Kernel account signs with ERC-1271 contract signatures. To avoid depending on that, a separate `viewer` EOA is granted decrypt rights via `FHE.allow(...)` and signs the permit instead.

---

## Architecture

```
Donor browser                         Arbitrum
┌──────────────────┐   donate()    ┌───────────────────────────┐
│ React + Tailwind │──────────────▶│ SodCrowdfund              │
│  - secret gen    │   refund()    │  - OpenZeppelin:          │
│  - commitment    │──────────────▶│    SafeERC20,             │
│  - FHE encrypt   │               │    ReentrancyGuard,       │
│                  │   withdraw()  │    Pausable (emergency)   │
└────────┬─────────┘◀──────────────│  - goal / deadline rules  │
         │                         └─────────────┬─────────────┘
         │ sponsored UserOps                     │ encrypted math
         ▼                                       ▼
┌──────────────────┐                   ┌───────────────────────┐
│ ZeroDev Kernel   │                   │ Fhenix CoFHE          │
│ smart account    │                   │  euint64 totals       │
│ + paymaster      │                   │  FHE.add / FHE.gte    │
└──────────────────┘                   └───────────────────────┘
```

### Components

| Component                      | Role                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `SodCrowdfund.sol`             | Campaigns, donations, refunds, withdrawals with public amounts |
| `SodConfidentialCrowdfund.sol` | The same rules with encrypted amounts and totals               |
| `ConfidentialUSDG.sol`         | FHERC20 wrapper of USDG (eUSDG, 6 decimals)                    |
| `MockUSDG.sol`                 | Test USDG (6 decimals, free mint) for Arbitrum Sepolia         |
| React + Tailwind frontend      | Create campaigns, shield, donate, refund, withdraw, unshield   |
| Hardhat                        | Compile, test, deploy                                          |
| OpenZeppelin                   | Audited building blocks for the contracts                      |
| Fhenix CoFHE                   | Encrypted amounts and totals                                   |
| ZeroDev                        | Gas-sponsored smart accounts                                   |

### About USDG

USDG is a regulated USD stablecoin issued by Paxos and used here with 6 decimals, which matches the `ConfidentialUSDG` wrapper. On testnet, Sod uses `MockUSDG` because Paxos test USDG may not be deployed on Arbitrum Sepolia. Check the [Paxos testnet token list](https://docs.paxos.com/guides/stablecoin/usdg/testnet) for current addresses. Moving to real USDG is a constructor argument change: pass the real token address to `ConfidentialUSDG` and set `TOKEN_ADDRESS`.

---

## Privacy: what is and isn’t hidden

Be honest with donors about this table.

| Property               | Status                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| Donation amount        | Hidden, if the donor wrapped more than they donated                             |
| Running total          | Hidden until settlement                                                         |
| Donor address          | **Public**, but harder to link because each donation comes from a fresh account |
| Gas-funding link       | Removed by the paymaster                                                        |
| Token funding link     | Still visible: the fresh account has to receive tokens from somewhere           |
| Creator payout address | Public                                                                          |

**Sod does not make donors anonymous.** FHE hides numbers, not who sent a transaction. True donor unlinkability needs a ZK pool (Semaphore or Tornado-style) or an existing privacy protocol, and is on the roadmap below.

---

## Tech stack

- **Chain:** Arbitrum (Arbitrum Sepolia for the demo, plus Robinhood Chain testnet if time allows)
- **Token:** USDG (Paxos Global Dollar), MockUSDG on testnet
- **Contracts:** Solidity, Hardhat, OpenZeppelin Contracts v5
- **Privacy:** Fhenix CoFHE (`@fhenixprotocol/cofhe-contracts`, `@cofhe/sdk`, `@cofhe/hardhat-plugin` for tests)
- **Account abstraction:** ZeroDev (`@zerodev/sdk`, `@zerodev/ecdsa-validator`) with `viem`
- **Frontend:** React, Tailwind CSS, viem with an injected wallet
- **Tests:** Hardhat with Chai (Hardhat network)

Package names and APIs for Fhenix and ZeroDev change often. Check their current docs (cofhe-docs.fhenix.zone and docs.zerodev.app) before installing.

---

## Sponsor tools used

| Sponsor          | How Sod uses it                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **OpenZeppelin** | `SafeERC20`, `ReentrancyGuard`, `Pausable`, and `Ownable` or `AccessControl` for the emergency pause |
| **Fhenix**       | Encrypted donation amounts, encrypted totals, goal check                                             |
| **ZeroDev**      | Kernel smart accounts and gas sponsorship                                                            |
| **Paxos / Global Dollar** | USDG as the campaign currency                                                               |

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

The frontend reads addresses from `frontend/src/contracts/deployment.json` (written by the deploy script) or from the `VITE_*` variables below. It talks to the chain with viem and an injected wallet.

### Environment variables

Root `.env`: `PRIVATE_KEY`, `ARBITRUM_SEPOLIA_RPC`. Optional: `TOKEN_ADDRESS` (use an existing USDG token instead of deploying `MockUSDG`), `SKIP_CONFIDENTIAL=1`.

`frontend/.env`: `VITE_SOD_ADDRESS`, `VITE_TOKEN_ADDRESS`, `VITE_SOD_CONF_ADDRESS`, `VITE_EUSDG_ADDRESS` (all optional if the deploy script wrote `deployment.json`), and `VITE_ZERODEV_RPC` in the form `https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/421614`.

### Project layout

```
sod/
├── contracts/
│   ├── SodCrowdfund.sol
│   ├── SodConfidentialCrowdfund.sol
│   ├── ConfidentialUSDG.sol
│   └── mocks/MockUSDG.sol
├── test/
│   ├── SodCrowdfund.test.ts
│   └── SodConfidentialCrowdfund.test.ts
├── scripts/deploy.ts
├── hardhat.config.ts
└── frontend/            # React + Tailwind (viem, @cofhe/sdk, @zerodev/sdk)
```

---

## Contract interface

| Function                                      | Who                    | Rule                                                                                                  |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `createCampaign(goal, deadline)`              | Anyone                 | Deadline must be in the future                                                                        |
| `donate(id, amount, commitment)`              | Anyone                 | Before the deadline; pulls tokens with `SafeERC20`                                                    |
| `refund(id, donationIndex, secret, refundTo)` | Anyone with the secret | Valid before the deadline, or after the deadline if the goal failed. Commitment must match. Once only |
| `withdraw(id)`                                | Creator only           | After the deadline, goal met, once only                                                               |

Every function that moves funds is `nonReentrant`, and state is updated before transfers (checks-effects-interactions). In the confidential contract, `amount` and the goal comparison are encrypted, and encrypted inputs are passed as `(bytes32 handle, bytes proof)`.

### Confidential contract behavior worth knowing

- The encrypted total is **frozen at the deadline**. Only refunds made before the deadline reduce it. Without this, a creator payout could make a later refund see a total of zero and pay out of the shared token pool.
- After the deadline, a refund on a funded campaign pays 0 and still marks the donation refunded. The contract cannot tell whether the goal was met without decrypting, so it settles on encrypted values.
- A donor who asks to donate more than they hold silently donates 0 (FHERC20 zero-replacement). The contract records what actually moved.
- `ConfidentialUSDG` depends on a linked library, `ERC20ConfidentialLib`. `scripts/deploy.ts` deploys and links it.
- Fhenix’s client SDK calls decryption permits **ACPs** (`client.acp`), and the default lifetime is 7 days.

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
- Encrypted donations, reveal, unshield, and access-control checks on the confidential contract

Run with `npx hardhat test`.

---

## Limitations

Read these before trusting Sod with real funds.

- **Not audited.** Testnet prototype only.
- **Donor addresses are public.** Sod hides amounts, not identities.
- **Wrapping into the confidential token is public.** Privacy depends on wrapping more than you donate and on a large enough crowd. With only a few donors, timing and sizes can narrow things down.
- **Unwrapping reveals the amount** when the creator converts confidential tokens back to USDG.
- **Issuer risk.** USDG is issued by Paxos, which can pause the token or blocklist addresses. All shielded USDG sits in one wrapper contract, so a freeze on that address would block every unshield. Sod uses `MockUSDG` on testnet, so this risk applies only to a real USDG deployment.
- **Gas costs and latency** are higher for FHE operations, and decryption is asynchronous.
- **No campaign or identity verification.** Fraud and compliance risks apply. Crypto fundraising rules vary by country, so this is not legal advice.
- **Emergency pause.** The pause role can only stop new donations. It can never move campaign funds.

---

## Roadmap

- [ ] Donor unlinkability via a ZK pool or an existing privacy protocol
- [ ] Campaign verification and creator reputation
- [ ] Third-party audit before any mainnet use

---

## License

MIT