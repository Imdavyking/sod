import { parseAbi, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";
import deployment from "../contracts/deployment.json";

const ZERO = "0x0000000000000000000000000000000000000000";
export const chain = arbitrumSepolia;

export const SOD_ADDRESS = (import.meta.env.VITE_SOD_ADDRESS ||
  deployment.sod) as Address;
export const TOKEN_ADDRESS = (import.meta.env.VITE_TOKEN_ADDRESS ||
  deployment.token) as Address;
export const SOD_CONF_ADDRESS = (import.meta.env.VITE_SOD_CONF_ADDRESS ||
  deployment.sodConfidential ||
  ZERO) as Address;
export const ECUSDC_ADDRESS = (import.meta.env.VITE_ECUSDC_ADDRESS ||
  deployment.confidentialToken ||
  ZERO) as Address;
export const ZERODEV_RPC = (import.meta.env.VITE_ZERODEV_RPC || "") as string;
export const TOKEN_DECIMALS = 6;

export const isConfigured =
  SOD_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
  TOKEN_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const sodAbi = parseAbi([
  "function createCampaign(string name, string description, string imageURI, uint256 goal, uint64 deadline) returns (uint256 id)",
  "function donate(uint256 id, uint256 amount, bytes32 commitment) returns (uint256 donationIndex)",
  "function refund(uint256 id, uint256 donationIndex, bytes32 secret, address refundTo)",
  "function withdraw(uint256 id)",
  "function campaignCount() view returns (uint256)",
  "function campaigns(uint256) view returns (address creator, uint256 goal, uint64 deadline, bool withdrawn, uint256 total, uint256 donationCount)",
  "function getDonation(uint256 id, uint256 donationIndex) view returns (uint256 amount, bytes32 commitment, bool refunded)",
  "function paused() view returns (bool)",
  "event Donated(uint256 indexed campaignId, uint256 indexed donationIndex, uint256 amount, bytes32 commitment)",
]);

export const tokenAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

export const isPrivateConfigured =
  SOD_CONF_ADDRESS !== ZERO && ECUSDC_ADDRESS !== ZERO && isConfigured;
export const isGaslessConfigured =
  isPrivateConfigured && ZERODEV_RPC.length > 0;

// Phase 2: encrypted amounts. `bytes32` stands in for the euint64 / externalEuint64 handle types.
export const sodConfAbi = parseAbi([
  "function createCampaign(string name, string description, string imageURI, uint64 goal, uint64 deadline) returns (uint256 id)",
  "function donate(uint256 id, bytes32 encAmount, bytes proof, bytes32 commitment, address viewer) returns (uint256 donationIndex)",
  "function refund(uint256 id, uint256 donationIndex, bytes32 secret, address refundTo)",
  "function withdraw(uint256 id)",
  "function campaignCount() view returns (uint256)",
  "function campaigns(uint256 id) view returns (address creator, uint64 goal, uint64 deadline, bool withdrawn, uint256 donationCount)",
  "function totalHandle(uint256 id) view returns (bytes32)",
  "function getDonation(uint256 id, uint256 donationIndex) view returns (bytes32 amount, bytes32 commitment, bool refunded)",
  "event Donated(uint256 indexed campaignId, uint256 indexed donationIndex, address indexed donor, bytes32 commitment)",
]);

export const ecusdcAbi = parseAbi([
  "function shield(address to, uint256 amount) returns (bytes32)",
  "function setOperator(address operator, uint48 until)",
  "function isOperator(address holder, address operator) view returns (bool)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function unshield(address from, address to, uint64 amount) returns (bytes32)",
  "function claimUnshielded(bytes32 id, uint64 decryptedAmount, bytes decryptionProof)",
  "function getUserClaims(address user) view returns ((bytes32 id, address to, bytes32 ctHash, uint64 decryptedAmount, bool claimed)[])",
]);
