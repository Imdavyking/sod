import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { Encryptable, FheTypes } from "@cofhe/sdk";

const USDC = (n: number) => BigInt(n) * 10n ** 6n;
const DAY = 24 * 60 * 60;
const FAR_FUTURE = 2n ** 47n; // operator expiry

function commitment(id: bigint | number, secret: string, refundTo: string) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32", "address"], [id, secret, refundTo])
  );
}
const newSecret = () => ethers.hexlify(ethers.randomBytes(32));

describe("SodConfidentialCrowdfund (Phase 2, FHE)", () => {
  async function deploy() {
    const [owner, creator, alice, bob, mallory, freshAddr, viewer] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockUSDC");
    const lib = await ethers.deployContract("ERC20ConfidentialLib");
    const Eusdc = await ethers.getContractFactory("ConfidentialUSDC", {
      libraries: { ERC20ConfidentialLib: await lib.getAddress() },
    });
    const eusdc = await Eusdc.deploy(await usdc.getAddress());
    const sod = await ethers.deployContract("SodConfidentialCrowdfund", [await eusdc.getAddress(), owner.address]);
    const sodAddr = await sod.getAddress();

    // Each donor shields 10,000 USDC (public wrap) and authorises Sod as operator.
    for (const s of [alice, bob, mallory]) {
      await usdc.mint(s.address, USDC(10_000));
      await usdc.connect(s).approve(await eusdc.getAddress(), ethers.MaxUint256);
      await eusdc.connect(s).shield(s.address, USDC(10_000));
      await eusdc.connect(s).setOperator(sodAddr, FAR_FUTURE);
    }

    const clients = {
      alice: await hre.cofhe.createClientWithBatteries(alice),
      bob: await hre.cofhe.createClientWithBatteries(bob),
      mallory: await hre.cofhe.createClientWithBatteries(mallory),
      viewer: await hre.cofhe.createClientWithBatteries(viewer),
    };

    const deadline = BigInt((await time.latest()) + 7 * DAY);
    await sod.connect(creator).createCampaign(USDC(1_000), deadline);

    return { sod, sodAddr, usdc, eusdc, owner, creator, alice, bob, mallory, freshAddr, viewer, clients, deadline, id: 0n };
  }
  type F = Awaited<ReturnType<typeof deploy>>;

  const plain = async (handle: string | bigint) => hre.cofhe.mocks.getPlaintext(BigInt(handle));
  const balanceOf = async (f: F, who: { address: string }) => plain(await f.eusdc.confidentialBalanceOf(who.address));

  async function donate(f: F, name: "alice" | "bob" | "mallory", amount: bigint, opts?: { refundTo?: string; viewer?: string }) {
    const donor = f[name];
    const secret = newSecret();
    const refundTo = opts?.refundTo ?? donor.address;
    const [handle, proof] = await f.clients[name]
      .encryptInputs([Encryptable.uint64(amount)])
      .setConsumingContract(f.sodAddr)
      .execute();
    const c = commitment(f.id, secret, refundTo);
    const args = [f.id, handle, proof, c, opts?.viewer ?? ethers.ZeroAddress] as const;
    const index = await f.sod.connect(donor).donate.staticCall(...args);
    await f.sod.connect(donor).donate(...args);
    return { secret, refundTo, index };
  }

  const totalOf = async (f: F) => plain(await f.sod.totalHandle(f.id));

  describe("successful campaign", () => {
    it("keeps amounts and the total encrypted, then pays the creator the full total", async () => {
      const f = await loadFixture(deploy);
      await donate(f, "alice", USDC(600));
      await donate(f, "bob", USDC(500));

      expect(await totalOf(f)).to.equal(USDC(1_100));
      expect(await balanceOf(f, f.alice)).to.equal(USDC(9_400));

      await time.increaseTo(f.deadline);
      await expect(f.sod.connect(f.creator).withdraw(f.id)).to.emit(f.sod, "Withdrawn").withArgs(f.id, f.creator.address);
      expect(await balanceOf(f, f.creator)).to.equal(USDC(1_100));
      expect(await balanceOf(f, { address: f.sodAddr })).to.equal(0n);
    });

    it("never writes a donation amount into events or public storage", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(777));
      const [, , donationLogs] = [null, null, await f.sod.queryFilter(f.sod.filters.Donated())];
      const ev = donationLogs[0];
      expect(ev.args.donor).to.equal(f.alice.address);
      // The only 32-byte values in the event are the indexed topics and the commitment.
      expect(ev.data.toLowerCase()).to.not.include(USDC(777).toString(16).padStart(64, "0"));
      expect(a.index).to.equal(0n);
    });

    it("pays 0 on refund after the deadline when the goal was met", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(1_000));
      await time.increaseTo(f.deadline);
      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      expect(await balanceOf(f, f.alice)).to.equal(USDC(9_000)); // nothing came back
      await f.sod.connect(f.creator).withdraw(f.id);
      expect(await balanceOf(f, f.creator)).to.equal(USDC(1_000));
    });
  });

  describe("cashing out", () => {
    it("creator can unshield the payout back to plain USDC", async () => {
      const f = await loadFixture(deploy);
      await donate(f, "alice", USDC(1_000));
      await time.increaseTo(f.deadline);
      await f.sod.connect(f.creator).withdraw(f.id);

      const creatorClient = await hre.cofhe.createClientWithBatteries(f.creator);
      await f.eusdc.connect(f.creator)["unshield(address,address,uint64)"](f.creator.address, f.creator.address, USDC(1_000));
      const [claim] = await f.eusdc.getUserClaims(f.creator.address);
      const { decryptedValue, signature } = await creatorClient.decryptForTx(claim.ctHash).withoutACP().execute();
      await f.eusdc.connect(f.creator).claimUnshielded(claim.id, decryptedValue, signature);

      expect(await f.usdc.balanceOf(f.creator.address)).to.equal(USDC(1_000));
      expect(await balanceOf(f, f.creator)).to.equal(0n);
    });
  });

  describe("failed campaign", () => {
    it("lets every donor refund after the deadline", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(300));
      const b = await donate(f, "bob", USDC(200));
      await time.increaseTo(f.deadline);

      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      await f.sod.refund(f.id, b.index, b.secret, b.refundTo);

      expect(await balanceOf(f, f.alice)).to.equal(USDC(10_000));
      expect(await balanceOf(f, f.bob)).to.equal(USDC(10_000));
      expect(await balanceOf(f, { address: f.sodAddr })).to.equal(0n);
    });

    it("creator withdrawal on a failed campaign pays 0 and does not block refunds", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(300));
      await time.increaseTo(f.deadline);
      await f.sod.connect(f.creator).withdraw(f.id);
      expect(await balanceOf(f, f.creator)).to.equal(0n);

      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      expect(await balanceOf(f, f.alice)).to.equal(USDC(10_000));
    });
  });

  describe("refund before the deadline", () => {
    it("returns funds and reduces the encrypted total", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(400));
      await donate(f, "bob", USDC(100));

      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      expect(await balanceOf(f, f.alice)).to.equal(USDC(10_000));
      expect(await totalOf(f)).to.equal(USDC(100));
    });

    it("can refund to a fresh address", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(250), { refundTo: f.freshAddr.address });
      await f.sod.refund(f.id, a.index, a.secret, f.freshAddr.address);
      expect(await balanceOf(f, f.freshAddr)).to.equal(USDC(250));
    });

    it("a refunded donation cannot leave a funded campaign looking funded", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(900));
      await donate(f, "bob", USDC(200));
      await f.sod.refund(f.id, a.index, a.secret, a.refundTo); // total now 200 < goal
      await time.increaseTo(f.deadline);
      await f.sod.connect(f.creator).withdraw(f.id);
      expect(await balanceOf(f, f.creator)).to.equal(0n);
    });
  });

  describe("donor without enough funds", () => {
    it("records 0 instead of reverting (FHERC20 zero-replacement)", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(50_000)); // alice only holds 10,000
      expect(await totalOf(f)).to.equal(0n);
      const [handle] = await f.sod.getDonation(f.id, a.index);
      expect(await plain(handle)).to.equal(0n);
      expect(await balanceOf(f, f.alice)).to.equal(USDC(10_000));
    });
  });

  describe("access control on encrypted values", () => {
    it("lets the donor and a designated viewer decrypt the donation, not a stranger", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(123), { viewer: f.viewer.address });
      const [handle] = await f.sod.getDonation(f.id, a.index);

      expect(await f.clients.alice.decryptForView(handle, FheTypes.Uint64).execute()).to.equal(USDC(123));
      expect(await f.clients.viewer.decryptForView(handle, FheTypes.Uint64).execute()).to.equal(USDC(123));
      const err = await f.clients.mallory.decryptForView(handle, FheTypes.Uint64).execute().then(() => null, (e: Error) => e);
      expect(err?.message).to.include("NotAllowed");
    });

    it("does not let the creator read the total until settlement", async () => {
      const f = await loadFixture(deploy);
      await donate(f, "alice", USDC(1_000));
      const creatorClient = await hre.cofhe.createClientWithBatteries(f.creator);

      const before = await creatorClient.decryptForView(await f.sod.totalHandle(f.id), FheTypes.Uint64).execute().then(() => null, (e: Error) => e);
      expect(before?.message).to.include("NotAllowed");

      await time.increaseTo(f.deadline);
      await f.sod.connect(f.creator).withdraw(f.id);
      // the default permit lasts 7 days and we jumped the chain past that, so issue a new one
      await creatorClient.acp.removeActiveACP();
      await creatorClient.acp.createSelf({
        issuer: f.creator.address,
        expiration: Math.floor(Date.now() / 1000) + 30 * DAY, // default is 7 days, which we just time-travelled past
      });
      expect(await creatorClient.decryptForView(await f.sod.totalHandle(f.id), FheTypes.Uint64).execute()).to.equal(
        USDC(1_000)
      );
    });
  });

  describe("Phase 3 assumption: encrypting for another sender", () => {
    it("an amount encrypted for bob's address can be donated by bob, using alice's client", async () => {
      const f = await loadFixture(deploy);
      // Alice's client encrypts the input as if bob were the sender (as the gasless flow does for a smart account).
      const [handle, proof] = await f.clients.alice
        .encryptInputs([Encryptable.uint64(USDC(40))])
        .setConsumingContract(f.sodAddr)
        .setAccount(f.bob.address)
        .execute();
      const c = commitment(f.id, newSecret(), f.bob.address);
      await f.sod.connect(f.bob).donate(f.id, handle, proof, c, ethers.ZeroAddress);
      expect(await totalOf(f)).to.equal(USDC(40));
      expect(await balanceOf(f, f.bob)).to.equal(USDC(9_960));
    });
  });

  describe("refund protection", () => {
    it("rejects a wrong secret and a wrong refundTo (front-run protection)", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(100));
      await expect(f.sod.refund(f.id, a.index, newSecret(), a.refundTo)).to.be.revertedWithCustomError(f.sod, "CommitmentMismatch");
      await expect(
        f.sod.connect(f.mallory).refund(f.id, a.index, a.secret, f.mallory.address)
      ).to.be.revertedWithCustomError(f.sod, "CommitmentMismatch");
      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      expect(await balanceOf(f, f.alice)).to.equal(USDC(10_000));
    });

    it("blocks a double refund and rejects bad indexes / targets", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(100));
      await donate(f, "bob", USDC(100));
      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      await expect(f.sod.refund(f.id, a.index, a.secret, a.refundTo)).to.be.revertedWithCustomError(f.sod, "AlreadyRefunded");
      await expect(f.sod.refund(f.id, 99, a.secret, a.refundTo)).to.be.revertedWithCustomError(f.sod, "UnknownDonation");
      await expect(f.sod.refund(f.id, a.index, a.secret, ethers.ZeroAddress)).to.be.revertedWithCustomError(
        f.sod,
        "InvalidRefundTarget"
      );
    });
  });

  describe("withdraw and donate protection", () => {
    it("blocks early, non-creator and double withdrawal", async () => {
      const f = await loadFixture(deploy);
      await donate(f, "alice", USDC(1_000));
      await expect(f.sod.connect(f.creator).withdraw(f.id)).to.be.revertedWithCustomError(f.sod, "CampaignNotEnded");
      await time.increaseTo(f.deadline);
      await expect(f.sod.connect(f.mallory).withdraw(f.id)).to.be.revertedWithCustomError(f.sod, "NotCreator");
      await f.sod.connect(f.creator).withdraw(f.id);
      await expect(f.sod.connect(f.creator).withdraw(f.id)).to.be.revertedWithCustomError(f.sod, "AlreadyWithdrawn");
    });

    it("blocks donating after the deadline", async () => {
      const f = await loadFixture(deploy);
      await time.increaseTo(f.deadline);
      await expect(donate(f, "alice", USDC(10))).to.be.revertedWithCustomError(f.sod, "CampaignEnded");
    });

    it("needs the donor to have authorised Sod as operator", async () => {
      const f = await loadFixture(deploy);
      await f.eusdc.connect(f.alice).setOperator(f.sodAddr, 0);
      await expect(donate(f, "alice", USDC(10))).to.be.reverted;
    });
  });

  describe("emergency pause", () => {
    it("stops new donations but never blocks refunds or withdrawals", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, "alice", USDC(1_000));
      const b = await donate(f, "bob", USDC(10));
      await f.sod.pause();
      await expect(donate(f, "alice", USDC(1))).to.be.revertedWithCustomError(f.sod, "EnforcedPause");

      await f.sod.refund(f.id, b.index, b.secret, b.refundTo); // pre-deadline refund works while paused
      expect(await balanceOf(f, f.bob)).to.equal(USDC(10_000));

      await time.increaseTo(f.deadline);
      await f.sod.connect(f.creator).withdraw(f.id);
      expect(await balanceOf(f, f.creator)).to.equal(USDC(1_000));
      expect(a.index).to.equal(0n);
    });

    it("only the owner can pause", async () => {
      const f = await loadFixture(deploy);
      await expect(f.sod.connect(f.mallory).pause()).to.be.revertedWithCustomError(f.sod, "OwnableUnauthorizedAccount");
    });
  });
});
