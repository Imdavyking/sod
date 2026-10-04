import { expect } from "chai";
import { ethers } from "hardhat";
import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";

const USDG = (n: number) => BigInt(n) * 10n ** 6n;
const DAY = 24 * 60 * 60;

function commitment(id: bigint | number, secret: string, refundTo: string) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "address"],
      [id, secret, refundTo],
    ),
  );
}

function newSecret() {
  return ethers.hexlify(ethers.randomBytes(32));
}

describe("SodCrowdfund", () => {
  async function deploy() {
    const [owner, creator, alice, bob, mallory, freshAddr] =
      await ethers.getSigners();

    const usdg = await ethers.deployContract("MockUSDG");
    const sod = await ethers.deployContract("SodCrowdfund", [
      await usdg.getAddress(),
      owner.address,
    ]);

    for (const s of [alice, bob, mallory]) {
      await usdg.mint(s.address, USDG(10_000));
      await usdg.connect(s).approve(await sod.getAddress(), ethers.MaxUint256);
    }

    const deadline = BigInt((await time.latest()) + 7 * DAY);
    await sod
      .connect(creator)
      .createCampaign(
        "Test campaign",
        "A test description",
        "ipfs://bafytest",
        USDG(1_000),
        deadline,
      );

    return {
      sod,
      usdg,
      owner,
      creator,
      alice,
      bob,
      mallory,
      freshAddr,
      deadline,
      id: 0n,
    };
  }

  async function donate(
    f: Awaited<ReturnType<typeof deploy>>,
    donor: Awaited<ReturnType<typeof deploy>>["alice"],
    amount: bigint,
    refundTo?: string,
  ) {
    const secret = newSecret();
    const to = refundTo ?? donor.address;
    const c = commitment(f.id, secret, to);
    const index = await f.sod.connect(donor).donate.staticCall(f.id, amount, c);
    await f.sod.connect(donor).donate(f.id, amount, c);
    return { secret, refundTo: to, index };
  }

  describe("createCampaign", () => {
    it("stores the campaign and emits an event", async () => {
      const { sod, creator, deadline } = await loadFixture(deploy);
      const c = await sod.campaigns(0);
      expect(c.creator).to.equal(creator.address);
      expect(c.goal).to.equal(USDG(1_000));
      expect(c.deadline).to.equal(deadline);
      expect(await sod.campaignCount()).to.equal(1n);
    });

    it("rejects a zero goal and a past deadline", async () => {
      const { sod, creator } = await loadFixture(deploy);
      const future = BigInt((await time.latest()) + DAY);
      await expect(
        sod
          .connect(creator)
          .createCampaign(
            "Test campaign",
            "A test description",
            "ipfs://bafytest",
            0,
            future,
          ),
      ).to.be.revertedWithCustomError(sod, "InvalidGoal");
      await expect(
        sod
          .connect(creator)
          .createCampaign(
            "Test campaign",
            "A test description",
            "ipfs://bafytest",
            USDG(1),
            BigInt(await time.latest()),
          ),
      ).to.be.revertedWithCustomError(sod, "InvalidDeadline");
    });
  });

  describe("campaign info (name, description, image)", () => {
    it("stores and returns the name, description and image link, and emits them for indexers", async () => {
      const { sod, creator } = await loadFixture(deploy);
      const future = BigInt((await time.latest()) + DAY);
      await expect(
        sod
          .connect(creator)
          .createCampaign(
            "Clean water for Ikorodu",
            "Fixing 3 boreholes.",
            "ipfs://bafyabc",
            USDG(5),
            future,
          ),
      )
        .to.emit(sod, "CampaignInfoSet")
        .withArgs(
          1n,
          "Clean water for Ikorodu",
          "Fixing 3 boreholes.",
          "ipfs://bafyabc",
        );
      const [name, description, imageURI] = await sod.getCampaignInfo(1);
      expect(name).to.equal("Clean water for Ikorodu");
      expect(description).to.equal("Fixing 3 boreholes.");
      expect(imageURI).to.equal("ipfs://bafyabc");
    });

    it("allows an empty description and image, but not an empty name", async () => {
      const { sod, creator } = await loadFixture(deploy);
      const future = BigInt((await time.latest()) + DAY);
      await sod
        .connect(creator)
        .createCampaign("Name only", "", "", USDG(1), future);
      await expect(
        sod.connect(creator).createCampaign("", "x", "", USDG(1), future),
      ).to.be.revertedWithCustomError(sod, "InvalidName");
    });

    it("enforces the byte limits exactly", async () => {
      const { sod, creator } = await loadFixture(deploy);
      const future = BigInt((await time.latest()) + DAY);
      const make = (n: number) => "a".repeat(n);
      await sod
        .connect(creator)
        .createCampaign(make(80), make(2000), make(300), USDG(1), future); // at the limit
      await expect(
        sod.connect(creator).createCampaign(make(81), "", "", USDG(1), future),
      ).to.be.revertedWithCustomError(sod, "InvalidName");
      await expect(
        sod
          .connect(creator)
          .createCampaign("n", make(2001), "", USDG(1), future),
      ).to.be.revertedWithCustomError(sod, "DescriptionTooLong");
      await expect(
        sod
          .connect(creator)
          .createCampaign("n", "", make(301), USDG(1), future),
      ).to.be.revertedWithCustomError(sod, "ImageURITooLong");
    });

    it("counts bytes, not characters (multi-byte text hits the limit sooner)", async () => {
      const { sod, creator } = await loadFixture(deploy);
      const future = BigInt((await time.latest()) + DAY);
      // each "é" is 2 bytes in UTF-8, so 41 of them is 82 bytes
      await expect(
        sod
          .connect(creator)
          .createCampaign("é".repeat(41), "", "", USDG(1), future),
      ).to.be.revertedWithCustomError(sod, "InvalidName");
      await sod
        .connect(creator)
        .createCampaign("é".repeat(40), "", "", USDG(1), future);
    });

    it("still validates the goal and deadline", async () => {
      const { sod, creator } = await loadFixture(deploy);
      const future = BigInt((await time.latest()) + DAY);
      await expect(
        sod.connect(creator).createCampaign("n", "", "", 0, future),
      ).to.be.revertedWithCustomError(sod, "InvalidGoal");
    });
  });

  describe("successful campaign", () => {
    it("lets the creator withdraw the full total after the deadline", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(600));
      await donate(f, f.bob, USDG(500));

      await time.increaseTo(f.deadline);

      const before = await f.usdg.balanceOf(f.creator.address);
      await expect(f.sod.connect(f.creator).withdraw(f.id))
        .to.emit(f.sod, "Withdrawn")
        .withArgs(f.id, f.creator.address, USDG(1_100));
      expect((await f.usdg.balanceOf(f.creator.address)) - before).to.equal(
        USDG(1_100),
      );
      expect(await f.usdg.balanceOf(await f.sod.getAddress())).to.equal(0n);
    });

    it("blocks refunds after the deadline once the goal is met", async () => {
      const f = await loadFixture(deploy);
      const d = await donate(f, f.alice, USDG(1_000));
      await time.increaseTo(f.deadline);
      await expect(
        f.sod.refund(f.id, d.index, d.secret, d.refundTo),
      ).to.be.revertedWithCustomError(f.sod, "GoalMet");
    });
  });

  describe("failed campaign", () => {
    it("lets every donor refund after the deadline", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(300));
      const b = await donate(f, f.bob, USDG(200));

      await time.increaseTo(f.deadline);

      await expect(
        f.sod.refund(f.id, a.index, a.secret, a.refundTo),
      ).to.changeTokenBalance(f.usdg, f.alice, USDG(300));
      await expect(
        f.sod.refund(f.id, b.index, b.secret, b.refundTo),
      ).to.changeTokenBalance(f.usdg, f.bob, USDG(200));
      expect(await f.usdg.balanceOf(await f.sod.getAddress())).to.equal(0n);
    });

    it("blocks creator withdrawal when the goal is not met", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(300));
      await time.increaseTo(f.deadline);
      await expect(
        f.sod.connect(f.creator).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "GoalNotMet");
    });
  });

  describe("refund before the deadline", () => {
    it("returns funds and reduces the campaign total", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(400));
      await donate(f, f.bob, USDG(100));

      await expect(
        f.sod.refund(f.id, a.index, a.secret, a.refundTo),
      ).to.changeTokenBalance(f.usdg, f.alice, USDG(400));
      expect((await f.sod.campaigns(f.id)).total).to.equal(USDG(100));
    });

    it("can refund to a fresh address", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(250), f.freshAddr.address);
      await expect(
        f.sod.refund(f.id, a.index, a.secret, f.freshAddr.address),
      ).to.changeTokenBalance(f.usdg, f.freshAddr, USDG(250));
    });

    it("a refunded donation cannot push a campaign over the goal", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(900));
      await donate(f, f.bob, USDG(200)); // total 1100, goal met
      await f.sod.refund(f.id, a.index, a.secret, a.refundTo); // total 200, goal no longer met
      await time.increaseTo(f.deadline);
      await expect(
        f.sod.connect(f.creator).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "GoalNotMet");
    });
  });

  describe("refund protection", () => {
    it("rejects a wrong secret", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(100));
      await expect(
        f.sod.refund(f.id, a.index, newSecret(), a.refundTo),
      ).to.be.revertedWithCustomError(f.sod, "CommitmentMismatch");
    });

    it("rejects a wrong refundTo (front-run protection)", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(100));
      // Mallory saw the secret in the mempool and tries to redirect the refund to herself.
      await expect(
        f.sod
          .connect(f.mallory)
          .refund(f.id, a.index, a.secret, f.mallory.address),
      ).to.be.revertedWithCustomError(f.sod, "CommitmentMismatch");
      // The honest refund still works afterwards.
      await expect(
        f.sod.refund(f.id, a.index, a.secret, a.refundTo),
      ).to.changeTokenBalance(f.usdg, f.alice, USDG(100));
    });

    it("blocks a double refund", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(100));
      await donate(f, f.bob, USDG(100));
      await f.sod.refund(f.id, a.index, a.secret, a.refundTo);
      await expect(
        f.sod.refund(f.id, a.index, a.secret, a.refundTo),
      ).to.be.revertedWithCustomError(f.sod, "AlreadyRefunded");
    });

    it("rejects an unknown donation index and the zero address", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(100));
      await expect(
        f.sod.refund(f.id, 99, a.secret, a.refundTo),
      ).to.be.revertedWithCustomError(f.sod, "UnknownDonation");
      await expect(
        f.sod.refund(f.id, a.index, a.secret, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(f.sod, "InvalidRefundTarget");
    });
  });

  describe("withdraw protection", () => {
    it("blocks early withdrawal", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(1_000));
      await expect(
        f.sod.connect(f.creator).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "CampaignNotEnded");
    });

    it("blocks non-creator withdrawal", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(1_000));
      await time.increaseTo(f.deadline);
      await expect(
        f.sod.connect(f.mallory).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "NotCreator");
      await expect(
        f.sod.connect(f.owner).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "NotCreator");
    });

    it("blocks double withdrawal", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(1_000));
      await time.increaseTo(f.deadline);
      await f.sod.connect(f.creator).withdraw(f.id);
      await expect(
        f.sod.connect(f.creator).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "AlreadyWithdrawn");
    });
  });

  describe("donate", () => {
    it("blocks donating after the deadline", async () => {
      const f = await loadFixture(deploy);
      await time.increaseTo(f.deadline);
      await expect(
        f.sod
          .connect(f.alice)
          .donate(
            f.id,
            USDG(10),
            commitment(f.id, newSecret(), f.alice.address),
          ),
      ).to.be.revertedWithCustomError(f.sod, "CampaignEnded");
    });

    it("rejects zero amounts, empty commitments and unknown campaigns", async () => {
      const f = await loadFixture(deploy);
      const c = commitment(f.id, newSecret(), f.alice.address);
      await expect(
        f.sod.connect(f.alice).donate(f.id, 0, c),
      ).to.be.revertedWithCustomError(f.sod, "InvalidAmount");
      await expect(
        f.sod.connect(f.alice).donate(f.id, USDG(1), ethers.ZeroHash),
      ).to.be.revertedWithCustomError(f.sod, "InvalidCommitment");
      await expect(
        f.sod.connect(f.alice).donate(42, USDG(1), c),
      ).to.be.revertedWithCustomError(f.sod, "UnknownCampaign");
    });

    it("computeCommitment matches the client-side formula", async () => {
      const f = await loadFixture(deploy);
      const secret = newSecret();
      expect(
        await f.sod.computeCommitment(f.id, secret, f.alice.address),
      ).to.equal(commitment(f.id, secret, f.alice.address));
    });
  });

  describe("emergency pause", () => {
    it("only the owner can pause", async () => {
      const f = await loadFixture(deploy);
      await expect(
        f.sod.connect(f.mallory).pause(),
      ).to.be.revertedWithCustomError(f.sod, "OwnableUnauthorizedAccount");
    });

    it("stops new donations and campaigns but never blocks refunds or withdrawals", async () => {
      const f = await loadFixture(deploy);
      const a = await donate(f, f.alice, USDG(1_000));
      await f.sod.pause();

      await expect(
        f.sod
          .connect(f.bob)
          .donate(f.id, USDG(1), commitment(f.id, newSecret(), f.bob.address)),
      ).to.be.revertedWithCustomError(f.sod, "EnforcedPause");
      await expect(
        f.sod
          .connect(f.creator)
          .createCampaign(
            "Test campaign",
            "A test description",
            "ipfs://bafytest",
            USDG(1),
            BigInt((await time.latest()) + DAY),
          ),
      ).to.be.revertedWithCustomError(f.sod, "EnforcedPause");

      // refund still works while paused
      await expect(
        f.sod.refund(f.id, a.index, a.secret, a.refundTo),
      ).to.changeTokenBalance(f.usdg, f.alice, USDG(1_000));
    });

    it("lets the creator withdraw while paused", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(1_000));
      await f.sod.pause();
      await time.increaseTo(f.deadline);
      await expect(
        f.sod.connect(f.creator).withdraw(f.id),
      ).to.changeTokenBalance(f.usdg, f.creator, USDG(1_000));
    });

    it("gives the owner no way to move campaign funds", async () => {
      const f = await loadFixture(deploy);
      await donate(f, f.alice, USDG(1_000));
      await time.increaseTo(f.deadline);
      // The owner is not the creator, so withdraw is closed to them, and pause cannot move tokens.
      await expect(
        f.sod.connect(f.owner).withdraw(f.id),
      ).to.be.revertedWithCustomError(f.sod, "NotCreator");
      await expect(f.sod.pause()).to.changeTokenBalance(f.usdg, f.owner, 0);
      expect(await f.usdg.balanceOf(await f.sod.getAddress())).to.equal(
        USDG(1_000),
      );
    });
  });
});
