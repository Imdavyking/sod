import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys the whole Sod stack:
 *   Phase 1  MockUSDC + SodCrowdfund                      (public amounts)
 *   Phase 2  ERC20ConfidentialLib + ConfidentialUSDC + SodConfidentialCrowdfund (encrypted amounts)
 *
 * Set TOKEN_ADDRESS to wrap/use an existing ERC-20 instead of deploying MockUSDC.
 * Set SKIP_CONFIDENTIAL=1 to deploy Phase 1 only (the FHE contracts need a CoFHE-enabled network).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  let tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) {
    const usdc = await ethers.deployContract("MockUSDC");
    await usdc.waitForDeployment();
    tokenAddress = await usdc.getAddress();
    console.log(`MockUSDC:                  ${tokenAddress}`);
  } else {
    console.log(`Token:                     ${tokenAddress} (existing)`);
  }

  // ---- Phase 1 ----
  const sod = await ethers.deployContract("SodCrowdfund", [tokenAddress, deployer.address]);
  await sod.waitForDeployment();
  const sodAddress = await sod.getAddress();
  console.log(`SodCrowdfund:              ${sodAddress}`);

  const out: Record<string, string | number> = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    token: tokenAddress,
    sod: sodAddress,
  };

  // ---- Phase 2 ----
  if (process.env.SKIP_CONFIDENTIAL !== "1") {
    const lib = await ethers.deployContract("ERC20ConfidentialLib");
    await lib.waitForDeployment();
    const libAddress = await lib.getAddress();
    console.log(`ERC20ConfidentialLib:      ${libAddress}`);

    const ConfidentialUSDC = await ethers.getContractFactory("ConfidentialUSDC", {
      libraries: { ERC20ConfidentialLib: libAddress },
    });
    const eusdc = await ConfidentialUSDC.deploy(tokenAddress);
    await eusdc.waitForDeployment();
    const eusdcAddress = await eusdc.getAddress();
    console.log(`ConfidentialUSDC:          ${eusdcAddress}`);

    const sodc = await ethers.deployContract("SodConfidentialCrowdfund", [eusdcAddress, deployer.address]);
    await sodc.waitForDeployment();
    const sodcAddress = await sodc.getAddress();
    console.log(`SodConfidentialCrowdfund:  ${sodcAddress}`);

    out.confidentialToken = eusdcAddress;
    out.sodConfidential = sodcAddress;
  }

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));

  // Hand the addresses to the frontend.
  const feDir = path.join(__dirname, "..", "frontend", "src", "contracts");
  if (fs.existsSync(path.join(__dirname, "..", "frontend"))) {
    fs.mkdirSync(feDir, { recursive: true });
    fs.writeFileSync(path.join(feDir, "deployment.json"), JSON.stringify(out, null, 2));
  }
  console.log(`Saved deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
