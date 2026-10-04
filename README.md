# Sod

**Trustless, private crowdfunding on Arbitrum.**

Sod is a GoFundMe-style platform where a smart contract, not a company, enforces the goal, the deadline, and refunds. Donors can take their money back before the deadline, and creators can only withdraw if the goal is met. Donation amounts are encrypted with Fhenix FHE, and donors sign in with Google, a passkey or an email through ZeroDev, so no wallet extension is needed.

Campaigns are funded in **USDG** (Global Dollar, issued by Paxos).

> **Status: hackathon project for Arbitrum Open House Singapore (Online Buildathon).**
> Testnet only, not audited. Read [Privacy: what is and isn’t hidden](#privacy-what-is-and-isnt-hidden) before trusting Sod with anything sensitive.

---

## Why Sod

People who give to sensitive causes (activism, legal defense, medical bills, journalism) often don’t want their giving public. Centralized platforms can freeze campaigns or accounts, and transparent chains expose every donor and every amount.

Sod moves the rules into a contract nobody can override, then hides the numbers.

| Problem                           | Sod’s approach                                                          |
| --------------------------------- | ----------------------------------------------------------------------- |
| Platform can freeze or keep funds | Contract-enforced escrow: no admin can move campaign funds              |
| Donor has no way out              | Refund before the deadline, plus automatic refunds if the goal fails    |
| Refund can be hijacked            | Refund is bound to a secret and a destination address (front-run proof) |
| Amounts are public                | Encrypted amounts and totals with Fhenix FHE                            |
| Crypto wallets scare off donors   | Sign in with Google, a passkey or an email (ZeroDev embedded wallet)    |

---

## How it works

### Actors

- **Donor** signs in, then gives confidential USDG to a campaign.
- **Creator** starts a campaign and withdraws if the goal is met.
- **Contract** holds the funds and enforces every rule.

### Campaign lifecycle

1. **Create.** Creator calls `createCampaign(name, description, imageURI, goal, deadline)`. The goal is in USDG base units (6 decimals).
1. **Shield.** Donor wraps USDG into a confidential (FHERC20-style) token, eUSDG. The wrap is public, so wrapping more than you donate keeps the real donation hidden.
1. **Donate.** Donor generates a one-time `refundSecret` in the browser, computes a commitment, encrypts the amount with the CoFHE client SDK, and donates from their signed-in wallet. The secret never leaves the browser until a refund.
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

### Sign-in (ZeroDev)

- ZeroDev is used only for onboarding. The `<ConnectWallet />` widget from `@zerodev/wallet-react-ui` lets a donor sign in with Google, a passkey or an email and gives them an embedded wallet.
- The wallet runs in `EOA` mode, so the signed-in account is a plain key-backed address. It signs every transaction and the EIP-712 permits (ACPs) that Fhenix uses for decryption, which need to verify against the connected address.
- Donors pay their own gas in Arbitrum Sepolia ETH.
- The app talks to the wallet through wagmi, so the usual hooks (`useAccount`, `useWalletClient`) work.

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
         │ sign in / sign                        │ encrypted math
         ▼                                       ▼
┌──────────────────┐                   ┌───────────────────────┐
│ ZeroDev wallet   │                   │ Fhenix CoFHE          │
│ Google / passkey │                   │  euint64 totals       │
│ / email          │                   │  FHE.add / FHE.gte    │
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
| ZeroDev                        | Sign-in and embedded wallet (Google, passkey, email)           |

### About USDG

USDG is a regulated USD stablecoin issued by Paxos and used here with 6 decimals, which matches the `ConfidentialUSDG` wrapper. On testnet, Sod uses `MockUSDG` because Paxos test USDG may not be deployed on Arbitrum Sepolia. Check the [Paxos testnet token list](https://docs.paxos.com/guides/stablecoin/usdg/testnet) for current addresses. Moving to real USDG is a constructor argument change: pass the real token address to `ConfidentialUSDG` and set `TOKEN_ADDRESS`.

---

## Privacy: what is and isn’t hidden

Be honest with donors about this table.

| Property               | Status                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| Donation amount        | Hidden, if the donor wrapped more than they donated                             |
| Running total          | Hidden until settlement                                                         |
| Donor address          | **Public**: the signed-in wallet address is the donor                           |
| Shield and unshield    | **Public**: wrapping and unwrapping amounts are visible on-chain                |
| Refunds                | Public events, with an optional different refund address                        |
| Creator payout address | Public                                                                          |

**Sod does not make donors anonymous.** FHE hides numbers, not who sent a transaction. True donor unlinkability needs a ZK pool (Semaphore or Tornado-style) or an existing privacy protocol, and is on the roadmap below.

---

## Tech stack

- **Chain:** Arbitrum (Arbitrum Sepolia for the demo, plus Robinhood Chain testnet if time allows)
- **Token:** USDG (Paxos Global Dollar), MockUSDG on testnet
- **Contracts:** Solidity, Hardhat, OpenZeppelin Contracts v5
- **Privacy:** Fhenix CoFHE (`@fhenixprotocol/cofhe-contracts`, `@cofhe/sdk`, `@cofhe/hardhat-plugin` for tests)
- **Sign-in:** ZeroDev embedded wallet (`@zerodev/wallet-react`, `@zerodev/wallet-react-ui`) with `wagmi` and `viem`
- **Frontend:** React, Tailwind CSS, wagmi, viem
- **Tests:** Hardhat with Chai (Hardhat network)

Package names and APIs for Fhenix and ZeroDev change often. Check their current docs (cofhe-docs.fhenix.zone and docs.zerodev.app) before installing.

---

## Sponsor tools used

| Sponsor          | How Sod uses it                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **OpenZeppelin** | `SafeERC20`, `ReentrancyGuard`, `Pausable`, and `Ownable` or `AccessControl` for the emergency pause |
| **Fhenix**       | Encrypted donation amounts, encrypted totals, goal check                                             |
| **ZeroDev**      | Seamless onboarding: sign in with Google, a passkey or an email, no wallet extension                 |
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

The frontend reads addresses from `frontend/src/contracts/deployment.json` (written by the deploy script) or from the `VITE_*` variables below. It talks to the chain with viem, and users sign in through ZeroDev.

`frontend/.npmrc` sets `legacy-peer-deps=true` because `@cofhe/sdk` and the ZeroDev packages declare peer dependencies that npm would otherwise reject. The ZeroDev packages are pinned, since they are early 0.0.x releases.

### Environment variables

Root `.env`: `PRIVATE_KEY`, `ARBITRUM_SEPOLIA_RPC`. Optional: `TOKEN_ADDRESS` (use an existing USDG token instead of deploying `MockUSDG`), `SKIP_CONFIDENTIAL=1`.

`frontend/.env`: `VITE_SOD_ADDRESS`, `VITE_TOKEN_ADDRESS`, `VITE_SOD_CONF_ADDRESS`, `VITE_EUSDG_ADDRESS` (all optional if the deploy script wrote `deployment.json`), and `VITE_ZERODEV_PROJECT_ID` (required for sign-in).

### ZeroDev dashboard setup

In [dashboard.zerodev.app](https://dashboard.zerodev.app), for your project:

1. Enable **Arbitrum Sepolia**.
2. Add your app origin to the allowed origins, for example `http://localhost:5173`.
3. Turn on the sign-in methods you want (Google, passkey, email).
4. Under Google OAuth, add the exact page URL as a redirect URL, for example `http://localhost:5173/`. It must match exactly, including the trailing slash.
5. Copy the project ID into `VITE_ZERODEV_PROJECT_ID`.

A new sign-in is a new address, so it starts with no balance. Fund it with a little Arbitrum Sepolia ETH for gas, then get test USDG (or mint `MockUSDG`) and shield some before using private mode.

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
└── frontend/            # React + Tailwind (wagmi, viem, @cofhe/sdk, @zerodev/wallet-react-ui)
```

---

## Contract interface

| Function                                      | Who                    | Rule                                                                                                  |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `createCampaign(name, description, imageURI, goal, deadline)` | Anyone | Name required, description up to 2,000 characters, image link up to 300. Deadline must be in the future |
| `donate(id, amount, commitment)`              | Anyone                 | Before the deadline; pulls tokens with `SafeERC20`. The confidential version is `donate(id, encAmount, proof, commitment, viewer)`, where `viewer` is an optional extra address allowed to decrypt the donation (the app passes the zero address) |
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
- Campaign name, description and image link are stored and validated
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
- **Donors pay gas.** Every account needs a little ETH on the network, and FHE operations cost more gas and are slower, with asynchronous decryption.
- **Embedded wallet.** Access to a donor's wallet depends on their Google, passkey or email login and on ZeroDev's service.
- **Refund secrets live in the browser.** Use Back up after each donation so you can refund from another device.
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