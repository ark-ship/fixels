"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMemo } from "react";
import { type Address, parseAbi, parseEventLogs } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { mainnet } from "wagmi/chains";

const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x2cfF3d4F83D5E7A3f6D087e936712d2C80a8E52e") as Address;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const WL_PRICE_TEXT = "Free";
const PUBLIC_PRICE_TEXT = "0.00025 ETH";

const FIXELS_ABI = parseAbi([
  "function repairMintOpen() view returns (bool)",
  "function repairMintPrice() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function repairMinted(address wallet) view returns (bool)",
  "function getRepair(address wallet) view returns (bool repaired, uint8 x, uint8 y, uint8 colorIndex, uint64 repairedAt)",
  "function mintRepair() payable",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

type TokenMeta = {
  name: string;
  description: string;
  image: string;
  attributes: {
    trait_type: string;
    value: string;
  }[];
};

function shortAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function decodeTokenURI(tokenURI?: string): TokenMeta | null {
  try {
    if (!tokenURI) return null;

    const prefix = "data:application/json;base64,";

    if (!tokenURI.startsWith(prefix)) return null;

    const base64 = tokenURI.replace(prefix, "");
    const jsonText = window.atob(base64);

    return JSON.parse(jsonText) as TokenMeta;
  } catch {
    return null;
  }
}

function colorName(colorIndex: number) {
  if (colorIndex === 0) return "Repair Red";
  if (colorIndex === 1) return "Signal Blue";
  if (colorIndex === 2) return "Mint Green";
  if (colorIndex === 3) return "Dead Yellow";
  if (colorIndex === 4) return "Cyber Purple";
  if (colorIndex === 5) return "Ghost White";
  if (colorIndex === 6) return "Glitch Cyan";
  return "Void Black";
}

function zoneName(x: number) {
  if (x < 21) return "Signal Zone";
  if (x < 43) return "Core Zone";
  return "Glitch Zone";
}

export default function RepairMintPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const {
    writeContract,
    data: mintHash,
    isPending: isMintWaiting,
    error: mintError,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isMintSuccess,
  } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  const account = address || ZERO_ADDRESS;
  const isWrongChain = isConnected && chainId !== mainnet.id;

  const { data: repairMintOpen } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "repairMintOpen",
  });

  const { data: repairMintPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "repairMintPrice",
  });

  const { data: totalSupply } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "totalSupply",
  });

  const { data: maxSupply } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "maxSupply",
  });

  const { data: repairData } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "getRepair",
    args: [account],
    query: {
      enabled: isConnected,
    },
  });

  const { data: alreadyMinted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "repairMinted",
    args: [account],
    query: {
      enabled: isConnected,
    },
  });

  const hasRepaired = Boolean(repairData?.[0]);
  const repairX = Number(repairData?.[1] || 0);
  const repairY = Number(repairData?.[2] || 0);
  const repairColorIndex = Number(repairData?.[3] || 0);

  const mintedTokenId = useMemo(() => {
    if (!receipt?.logs || !address) return null;

    try {
      const transferLogs = parseEventLogs({
        abi: FIXELS_ABI,
        logs: receipt.logs,
        eventName: "Transfer",
        strict: false,
      });

      const mintTransfer = transferLogs.find((log) => {
        const to = String(log.args.to).toLowerCase();
        const from = String(log.args.from).toLowerCase();

        return to === address.toLowerCase() && from === ZERO_ADDRESS.toLowerCase();
      });

      return mintTransfer?.args.tokenId || null;
    } catch {
      return null;
    }
  }, [receipt, address]);

  const { data: mintedTokenURI } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "tokenURI",
    args: [mintedTokenId || 0n],
    query: {
      enabled: Boolean(mintedTokenId),
    },
  });

  const tokenMeta = useMemo(() => {
    return decodeTokenURI(mintedTokenURI);
  }, [mintedTokenURI]);

  const canMint =
    isConnected &&
    !isWrongChain &&
    repairMintOpen &&
    hasRepaired &&
    !alreadyMinted &&
    !isMintWaiting &&
    !isConfirming;

  function handleMintRepair() {
    if (!repairMintPrice && repairMintPrice !== 0n) return;

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: FIXELS_ABI,
      functionName: "mintRepair",
      value: repairMintPrice,
      chainId: mainnet.id,
    });
  }

  return (
    <main className="page">
      <div className="noise" />

      <nav className="nav">
        <a className="brand" href="/">
          <img className="brandLogo" src="/fixels.png" alt="Fixels" />
          <span>Fixels</span>
        </a>

        <div className="navRight">
          <a href="/">Canvas</a>
          <a href="/repair-mint">Repair Mint</a>
          <ConnectButton />
        </div>
      </nav>

      <section className="hero">
        <div className="heroText">
          <div className="badge">
            <span />
            Repair Mint
          </div>

          <h1>
            Mint from your
            <br />
            repaired pixel.
          </h1>

          <p>
            Your NFT identity comes from the coordinate, patch color, and zone you repaired
            on the Broken Canvas.
          </p>

          <div className="stats">
            <div>
              <span>Total Minted</span>
              <strong>
                {totalSupply?.toString() || "0"}/{maxSupply?.toString() || "2222"}
              </strong>
            </div>

            <div>
              <span>WL Price</span>
              <strong>{WL_PRICE_TEXT}</strong>
            </div>

            <div>
              <span>Public Price</span>
              <strong>{PUBLIC_PRICE_TEXT}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>{repairMintOpen ? "Open" : "Closed"}</strong>
            </div>
          </div>
        </div>

        <div className="mintCard">
          <div className="cardTop">
            <p>Wallet</p>
            <strong>{address ? shortAddress(address) : "Not connected"}</strong>
          </div>

          {!isConnected && (
            <div className="notice">
              <strong>Connect wallet first</strong>
              <span>Use the same wallet that repaired one pixel.</span>
            </div>
          )}

          {isConnected && isWrongChain && (
            <div className="notice danger">
              <strong>Wrong network</strong>
              <span>Switch to Ethereum Mainnet to mint your Fixel.</span>

              <button onClick={() => switchChain({ chainId: mainnet.id })}>
                Switch to Ethereum
              </button>
            </div>
          )}

          {isConnected && !isWrongChain && (
            <>
              <div className="repairBox">
                <span>Repair Status</span>

                {hasRepaired ? (
                  <strong className="green">Repaired</strong>
                ) : (
                  <strong className="red">Not repaired</strong>
                )}
              </div>

              {hasRepaired && (
                <div className="receipt">
                  <div>
                    <span>Coordinate</span>
                    <strong>
                      X{repairX}-Y{repairY}
                    </strong>
                  </div>

                  <div>
                    <span>Patch Color</span>
                    <strong>{colorName(repairColorIndex)}</strong>
                  </div>

                  <div>
                    <span>Zone</span>
                    <strong>{zoneName(repairX)}</strong>
                  </div>
                </div>
              )}

              {alreadyMinted && (
                <div className="notice">
                  <strong>Already minted</strong>
                  <span>This wallet already claimed Repair Mint.</span>
                </div>
              )}

              {!hasRepaired && (
                <div className="notice danger">
                  <strong>No repair found</strong>
                  <span>Repair one pixel first on the Broken Canvas.</span>
                </div>
              )}

              {!repairMintOpen && (
                <div className="notice danger">
                  <strong>Repair Mint closed</strong>
                  <span>Repair Mint is not open yet.</span>
                </div>
              )}

              <button className="mintButton" disabled={!canMint} onClick={handleMintRepair}>
                {isMintWaiting
                  ? "Confirm in wallet..."
                  : isConfirming
                  ? "Minting..."
                  : alreadyMinted
                  ? "Already Minted"
                  : "Mint Repair NFT"}
              </button>

              {mintHash && (
                <div className="txBox">
                  <span>Transaction</span>
                  <a
                    href={`https://etherscan.io/tx/${mintHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Etherscan
                  </a>
                </div>
              )}

              {mintError && <p className="errorText">{mintError.message}</p>}
            </>
          )}
        </div>
      </section>

      {isMintSuccess && (
        <section className="previewSection">
          <div className="sectionHead">
            <p>Mint Result</p>
            <h2>Your Fixel is onchain</h2>
          </div>

          <div className="previewGrid">
            <div className="imageBox">
              {tokenMeta?.image ? (
                <img src={tokenMeta.image} alt={tokenMeta.name} />
              ) : (
                <div className="loadingImage">Loading onchain image...</div>
              )}
            </div>

            <div className="metaBox">
              <p>Token</p>
              <h3>{tokenMeta?.name || "Fixels"}</h3>

              {mintedTokenId && (
                <span className="tokenId">Token ID #{mintedTokenId.toString()}</span>
              )}

              <div className="attrs">
                {tokenMeta?.attributes?.map((attr) => (
                  <div key={`${attr.trait_type}-${attr.value}`}>
                    <span>{attr.trait_type}</span>
                    <strong>{attr.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f3ecd8;
          color: #111;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          overflow: hidden;
          position: relative;
        }

        .noise {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.14;
          background-image: linear-gradient(#111 1px, transparent 1px),
            linear-gradient(90deg, #111 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(circle at center, transparent 0%, black 85%);
        }

        .nav {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
          padding: 24px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
          z-index: 2;
        }

        .brand {
          color: #111;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 900;
          letter-spacing: -0.04em;
          font-size: 22px;
        }

        .brandLogo {
          width: 42px;
          height: 42px;
          object-fit: contain;
          image-rendering: pixelated;
        }

        .navRight {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .navRight a {
          color: #111;
          text-decoration: none;
          font-weight: 800;
          font-size: 13px;
          text-transform: uppercase;
        }

        .hero {
          width: min(1180px, calc(100% - 32px));
          margin: 42px auto 0;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 28px;
          align-items: stretch;
          position: relative;
          z-index: 2;
        }

        .heroText {
          background: #fff8e6;
          border: 4px solid #111;
          box-shadow: 8px 8px 0 #111;
          padding: 44px;
        }

        .badge {
          width: fit-content;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #111;
          color: #f3ecd8;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .badge span {
          width: 9px;
          height: 9px;
          background: #4dff88;
          display: block;
          box-shadow: 0 0 0 3px #2e9f58;
        }

        h1 {
          font-size: clamp(42px, 7vw, 82px);
          line-height: 0.9;
          letter-spacing: -0.08em;
          margin: 28px 0 20px;
        }

        .heroText p {
          font-size: 16px;
          line-height: 1.7;
          max-width: 620px;
          color: #333;
          font-weight: 700;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 34px;
        }

        .stats div {
          background: #f3ecd8;
          border: 3px solid #111;
          padding: 16px;
        }

        .stats span,
        .repairBox span,
        .receipt span,
        .txBox span,
        .attrs span,
        .cardTop p,
        .metaBox p {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 900;
          color: #555;
          margin-bottom: 6px;
        }

        .stats strong {
          font-size: 18px;
        }

        .mintCard {
          background: #111;
          color: #f3ecd8;
          border: 4px solid #111;
          box-shadow: 8px 8px 0 #59f0ff;
          padding: 28px;
        }

        .cardTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid rgba(243, 236, 216, 0.2);
          padding-bottom: 18px;
          margin-bottom: 18px;
        }

        .cardTop strong {
          color: #59f0ff;
        }

        .notice {
          background: #1e1e1e;
          border: 2px solid rgba(243, 236, 216, 0.2);
          padding: 16px;
          margin-bottom: 16px;
        }

        .notice strong {
          display: block;
          margin-bottom: 6px;
        }

        .notice span {
          color: #cfc7ad;
          font-size: 13px;
          line-height: 1.5;
        }

        .notice.danger {
          border-color: #ff4d4d;
        }

        .notice button {
          margin-top: 12px;
          border: 0;
          background: #59f0ff;
          color: #111;
          font-weight: 900;
          padding: 12px 14px;
          cursor: pointer;
        }

        .repairBox {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #1e1e1e;
          border: 2px solid rgba(243, 236, 216, 0.2);
          padding: 16px;
          margin-bottom: 14px;
        }

        .green {
          color: #4dff88;
        }

        .red {
          color: #ff4d4d;
        }

        .receipt {
          display: grid;
          gap: 10px;
          margin-bottom: 18px;
        }

        .receipt div {
          background: #1e1e1e;
          border: 2px solid rgba(243, 236, 216, 0.2);
          padding: 14px;
        }

        .receipt strong {
          color: #fff8e6;
        }

        .mintButton {
          width: 100%;
          border: 0;
          background: #ff4d4d;
          color: #111;
          padding: 18px;
          font-weight: 1000;
          font-size: 15px;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 5px 5px 0 #f3ecd8;
        }

        .mintButton:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }

        .txBox {
          margin-top: 18px;
          background: #1e1e1e;
          border: 2px solid rgba(243, 236, 216, 0.2);
          padding: 14px;
        }

        .txBox a {
          color: #59f0ff;
          font-weight: 900;
        }

        .errorText {
          background: rgba(255, 77, 77, 0.12);
          color: #ff8b8b;
          border: 2px solid #ff4d4d;
          padding: 12px;
          font-size: 12px;
          line-height: 1.5;
          margin-top: 14px;
          word-break: break-word;
        }

        .previewSection {
          width: min(1180px, calc(100% - 32px));
          margin: 58px auto 80px;
          position: relative;
          z-index: 2;
        }

        .sectionHead p {
          font-size: 12px;
          font-weight: 1000;
          text-transform: uppercase;
          margin: 0 0 8px;
        }

        .sectionHead h2 {
          font-size: clamp(34px, 5vw, 58px);
          letter-spacing: -0.07em;
          margin: 0 0 24px;
        }

        .previewGrid {
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 24px;
          align-items: stretch;
        }

        .imageBox {
          background: #111;
          border: 4px solid #111;
          box-shadow: 8px 8px 0 #111;
          padding: 18px;
          display: grid;
          place-items: center;
          min-height: 420px;
        }

        .imageBox img {
          width: 100%;
          height: auto;
          image-rendering: pixelated;
          background: #f3ecd8;
        }

        .loadingImage {
          color: #f3ecd8;
          font-weight: 900;
        }

        .metaBox {
          background: #fff8e6;
          border: 4px solid #111;
          box-shadow: 8px 8px 0 #111;
          padding: 28px;
        }

        .metaBox h3 {
          font-size: 36px;
          margin: 0 0 8px;
          letter-spacing: -0.06em;
        }

        .tokenId {
          display: inline-block;
          background: #111;
          color: #f3ecd8;
          padding: 8px 12px;
          font-weight: 900;
          margin-bottom: 18px;
        }

        .attrs {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-top: 20px;
        }

        .attrs div {
          background: #f3ecd8;
          border: 3px solid #111;
          padding: 14px;
        }

        .attrs strong {
          font-size: 15px;
        }

        @media (max-width: 900px) {
          .hero,
          .previewGrid {
            grid-template-columns: 1fr;
          }

          .heroText {
            padding: 28px;
          }

          .stats,
          .attrs {
            grid-template-columns: 1fr;
          }

          .nav {
            align-items: flex-start;
            gap: 20px;
            flex-direction: column;
          }

          .navRight {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </main>
  );
}