import { createPublicClient, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x2cfF3d4F83D5E7A3f6D087e936712d2C80a8E52e") as Address;

export const FIXELS_VERIFY_ABI = parseAbi([
  "function getRepair(address wallet) view returns (bool repaired, uint8 x, uint8 y, uint8 colorIndex, uint64 repairedAt)",
]);

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.RPC_URL),
});