"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseAbiItem } from "viem";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { mainnet } from "wagmi/chains";

type RepairEntry = {
  wallet: string;
  x: number;
  y: number;
  color: string;
  colorName: string;
  timestamp: number;
};

type PatchColor = {
  name: string;
  value: string;
};

const CANVAS_SIZE = 64;

const TARGET_CHAIN = mainnet;
const CHAIN_NAME = "Ethereum";
const EXPLORER_TX_URL = "https://etherscan.io/tx";

const SHOW_DEBUG = false;

const CONTRACT_ADDRESS =
  "0x2cfF3d4F83D5E7A3f6D087e936712d2C80a8E52e" as `0x${string}`;

const CONTRACT_START_BLOCK = (() => {
  try {
    return BigInt(process.env.NEXT_PUBLIC_CONTRACT_START_BLOCK || "0");
  } catch {
    return 0n;
  }
})();

const LOG_CHUNK_SIZE = 5000n;

const STORAGE_KEY = `fixels_repairs_${TARGET_CHAIN.id}_${CONTRACT_ADDRESS.toLowerCase()}`;

const X_LINK = "https://x.com/Fixels_ETH";
const DISCORD_LINK = "https://discord.gg/7kySf4g2";

const FIXELS_ABI = [
  {
    type: "function",
    name: "repairPixel",
    stateMutability: "payable",
    inputs: [
      { name: "x", type: "uint8" },
      { name: "y", type: "uint8" },
      { name: "colorIndex", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repairFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "repairOpen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const PATCH_COLORS: PatchColor[] = [
  { name: "Repair Red", value: "#ff4d4d" },
  { name: "Signal Blue", value: "#4d8dff" },
  { name: "Mint Green", value: "#4dff88" },
  { name: "Dead Yellow", value: "#ffe15c" },
  { name: "Cyber Purple", value: "#9b5cff" },
  { name: "Ghost White", value: "#ffffff" },
  { name: "Glitch Cyan", value: "#59f0ff" },
  { name: "Void Black", value: "#111111" },
];

function shortWallet(wallet: string) {
  if (!wallet) return "";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function coordinateKey(x: number, y: number) {
  return `${x}-${y}`;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const wallet = address || "";
  const isCorrectNetwork = chainId === TARGET_CHAIN.id;
  const isContractReady = Boolean(CONTRACT_ADDRESS);

  const publicClient = usePublicClient({ chainId: TARGET_CHAIN.id });

  const [entries, setEntries] = useState<RepairEntry[]>([]);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
  const [selectedColor, setSelectedColor] = useState<PatchColor>(PATCH_COLORS[0]);
  const [receipt, setReceipt] = useState<RepairEntry | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [repairHash, setRepairHash] = useState<`0x${string}` | undefined>();
  const [pendingRepair, setPendingRepair] = useState<RepairEntry | null>(null);

  const { data: repairFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "repairFee",
    chainId: TARGET_CHAIN.id,
    query: {
      enabled: isContractReady,
      refetchInterval: 3000,
    },
  });

  const {
    data: repairOpen,
    isLoading: repairOpenLoading,
    error: repairOpenError,
    refetch: refetchRepairOpen,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: FIXELS_ABI,
    functionName: "repairOpen",
    chainId: TARGET_CHAIN.id,
    query: {
      enabled: isContractReady,
      refetchInterval: 3000,
    },
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: repairHash,
    });

  useEffect(() => {
    if (!publicClient) return;

    const client = publicClient;
    let cancelled = false;

    async function loadRepairsFromChain() {
      try {
        if (!isContractReady) {
          setEntries([]);
          return;
        }

        if (CONTRACT_START_BLOCK === 0n) {
          console.warn("Missing NEXT_PUBLIC_CONTRACT_START_BLOCK. Set deploy block for mainnet.");

          const saved = window.localStorage.getItem(STORAGE_KEY);

          if (!saved) {
            setEntries([]);
            return;
          }

          try {
            const parsed = JSON.parse(saved) as RepairEntry[];
            setEntries(Array.isArray(parsed) ? parsed : []);
          } catch {
            setEntries([]);
          }

          return;
        }

        const latestBlock = await client.getBlockNumber();
        let fromBlock = CONTRACT_START_BLOCK;
        const chainEntries: RepairEntry[] = [];

        while (fromBlock <= latestBlock) {
          const toBlock =
            fromBlock + LOG_CHUNK_SIZE > latestBlock
              ? latestBlock
              : fromBlock + LOG_CHUNK_SIZE;

          const logs = await client.getLogs({
            address: CONTRACT_ADDRESS,
            event: parseAbiItem(
              "event PixelRepaired(address indexed wallet, uint8 x, uint8 y, uint8 colorIndex)"
            ),
            fromBlock,
            toBlock,
          });

          for (const log of logs) {
            const colorIndex = Number(log.args.colorIndex);
            const patchColor = PATCH_COLORS[colorIndex] || PATCH_COLORS[0];

            chainEntries.push({
              wallet: String(log.args.wallet),
              x: Number(log.args.x),
              y: Number(log.args.y),
              color: patchColor.value,
              colorName: patchColor.name,
              timestamp: Number(log.blockNumber || 0n),
            });
          }

          fromBlock = toBlock + 1n;
        }

        if (!cancelled) {
          setEntries(chainEntries);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chainEntries));
        }
      } catch (err) {
        console.error("Failed to load repairs from chain:", err);

        const saved = window.localStorage.getItem(STORAGE_KEY);

        if (!saved) {
          setEntries([]);
          return;
        }

        try {
          const parsed = JSON.parse(saved) as RepairEntry[];
          setEntries(Array.isArray(parsed) ? parsed : []);
        } catch {
          setEntries([]);
        }
      }
    }

    loadRepairsFromChain();

    return () => {
      cancelled = true;
    };
  }, [publicClient, refreshNonce, isContractReady]);

  useEffect(() => {
    if (!isConfirmed || !pendingRepair) return;

    setEntries((currentEntries) => {
      const exists = currentEntries.some(
        (entry) =>
          entry.wallet.toLowerCase() === pendingRepair.wallet.toLowerCase() ||
          coordinateKey(entry.x, entry.y) === coordinateKey(pendingRepair.x, pendingRepair.y)
      );

      if (exists) return currentEntries;

      const updated = [...currentEntries, pendingRepair];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      return updated;
    });

    setReceipt(pendingRepair);
    setSelectedPixel(null);
    setPendingRepair(null);
    setRepairHash(undefined);
    refetchRepairOpen();
  }, [isConfirmed, pendingRepair, refetchRepairOpen]);

  const repairedMap = useMemo(() => {
    const map = new Map<string, RepairEntry>();

    for (const entry of entries) {
      map.set(coordinateKey(entry.x, entry.y), entry);
    }

    return map;
  }, [entries]);

  const currentWalletEntry = useMemo(() => {
    if (!wallet) return null;

    return (
      entries.find((entry) => entry.wallet.toLowerCase() === wallet.toLowerCase()) || null
    );
  }, [entries, wallet]);

  const totalPixels = CANVAS_SIZE * CANVAS_SIZE;
  const repairedCount = entries.length;
  const repairedPercent = Math.min(100, Math.round((repairedCount / totalPixels) * 100));

  const repairIsOpen = repairOpen === true;

  function selectPixel(x: number, y: number) {
    setError("");

    const key = coordinateKey(x, y);

    if (repairedMap.has(key)) {
      const owner = repairedMap.get(key);

      setError(`Pixel X${x}-Y${y} has already been repaired by ${shortWallet(owner?.wallet || "")}.`);

      return;
    }

    setSelectedPixel({ x, y });
  }

  async function submitRepair() {
    setError("");
    setCopied(false);

    if (!isContractReady) {
      setError("Contract address is not ready.");
      return;
    }

    if (!isConnected || !wallet) {
      setError("Connect your wallet first.");
      return;
    }

    if (!isCorrectNetwork) {
      setError(`Please switch to ${CHAIN_NAME} network first.`);
      switchChain?.({ chainId: TARGET_CHAIN.id });
      return;
    }

    if (repairOpenLoading) {
      setError("Repair status is still loading. Try again.");
      return;
    }

    if (repairOpenError) {
      setError("Could not read repair status from contract. Refresh and try again.");
      return;
    }

    if (!repairIsOpen) {
      setError("Repair is not open yet.");
      return;
    }

    if (repairFee === undefined) {
      setError("Repair fee is still loading. Try again.");
      return;
    }

    if (!selectedPixel) {
      setError("Choose one dead pixel on the canvas first.");
      return;
    }

    const alreadyJoined = entries.some(
      (entry) => entry.wallet.toLowerCase() === wallet.toLowerCase()
    );

    if (alreadyJoined) {
      setError("This wallet has already repaired one pixel and secured a Repair Mint spot.");
      return;
    }

    const key = coordinateKey(selectedPixel.x, selectedPixel.y);

    if (repairedMap.has(key)) {
      setError("This pixel was just taken by another wallet. Please choose another pixel.");
      return;
    }

    const colorIndex = PATCH_COLORS.findIndex(
      (color) => color.name === selectedColor.name
    );

    if (colorIndex < 0) {
      setError("Invalid patch color.");
      return;
    }

    const newEntry: RepairEntry = {
      wallet,
      x: selectedPixel.x,
      y: selectedPixel.y,
      color: selectedColor.value,
      colorName: selectedColor.name,
      timestamp: Date.now(),
    };

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: FIXELS_ABI,
        functionName: "repairPixel",
        args: [selectedPixel.x, selectedPixel.y, colorIndex],
        value: repairFee,
        chainId: TARGET_CHAIN.id,
      });

      setPendingRepair(newEntry);
      setRepairHash(hash);
    } catch (err) {
      console.error(err);
      setError("Transaction failed or was rejected.");
    }
  }

  function copyReceipt() {
    if (!receipt) return;

    const text = `FIXELS REPAIR RECEIPT

Wallet: ${receipt.wallet}
Coordinate: X${receipt.x}-Y${receipt.y}
Patch Color: ${receipt.colorName}
Status: Repair Mint Secured

Repair one pixel. Become a Fixel.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
  }

  function refreshCanvas() {
    setReceipt(null);
    setSelectedPixel(null);
    setError("");
    setPendingRepair(null);
    setRepairHash(undefined);
    window.localStorage.removeItem(STORAGE_KEY);
    setRefreshNonce((current) => current + 1);
    refetchRepairOpen();
  }

  return (
    <main className="site">
      <div className="noise" />

      <nav className="navbar">
        <div className="brand">
          <img className="brandLogo" src="/fixels.png" alt="Fixels" />
          <p>FIXELS</p>
        </div>

        <div className="navLinks">
          <a href="#repair">Repair</a>
          <a href="/repair-mint">Repair Mint</a>
          <a href="#utility">Utility</a>
        </div>

        <ConnectButton />
      </nav>

      {SHOW_DEBUG && (
        <div
          style={{
            width: "min(1180px, calc(100% - 32px))",
            margin: "12px auto",
            padding: 14,
            border: "3px solid #111",
            background: "#fff8e6",
            fontFamily: "monospace",
            fontWeight: 900,
            wordBreak: "break-word",
          }}
        >
          <div>Debug Contract: {CONTRACT_ADDRESS}</div>
          <div>Debug Chain ID: {chainId}</div>
          <div>Debug Target Chain: {TARGET_CHAIN.id}</div>
          <div>Debug Repair Open: {String(repairOpen)}</div>
          <div>Debug Loading: {String(repairOpenLoading)}</div>
          <div>Debug Error: {repairOpenError ? repairOpenError.message : "none"}</div>
        </div>
      )}

      <section className="hero">
        <div className="heroText">
          <div className="eyebrow">
            <span className="liveDot" />
            {repairIsOpen ? "Repair is open" : "Repair is closed"}
          </div>

          <h1>
            Repair one pixel.
            <br />
            Become a Fixel.
          </h1>

          <p className="heroDesc">
            Fixels are onchain pixel workers born from repaired pixels.
            Leave your mark on the Broken Canvas.
          </p>

          <div className="heroActions">
            <a className="primaryLink" href="#repair">
              Open Canvas
            </a>
            <a className="secondaryLink" href="#mint">
              Mint Rules
            </a>
          </div>
        </div>

        <div className="heroCard heroCardStatusOnly">
          <div className="heroCardInfo heroCardInfoOnly">
            <p>Canvas Status</p>
            <h3>{repairedCount} pixels repaired</h3>

            <div className="progressOuter">
              <div className="progressInner" style={{ width: `${repairedPercent}%` }} />
            </div>

            <span>{repairedPercent}% of Broken Canvas repaired</span>

            <div className="networkBox">
              <span>Network</span>
              <strong>{isCorrectNetwork ? CHAIN_NAME : "Wrong Network"}</strong>
            </div>

            {repairHash && (
              <div className="txBox">
                <span>Transaction</span>
                <a
                  href={`${EXPLORER_TX_URL}/${repairHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Etherscan
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="repairSection" id="repair">
        <div className="sectionHeader">
          <p>Repair Mechanic</p>
          <h2>Broken Canvas</h2>
          <span>
            Choose one empty pixel. Your coordinate becomes part of your mint identity.
          </span>
        </div>

        <div className="repairGrid">
          <div className="canvasPanel">
            <div className="canvasTop">
              <div>
                <p>Canvas 64x64</p>
                <h3>
                  {repairedCount}/{totalPixels} repaired
                </h3>
              </div>

              <button className="resetButton" onClick={refreshCanvas}>
                Refresh Canvas
              </button>
            </div>

            <div className="pixelCanvas">
              {Array.from({ length: totalPixels }).map((_, index) => {
                const x = index % CANVAS_SIZE;
                const y = Math.floor(index / CANVAS_SIZE);
                const key = coordinateKey(x, y);
                const repaired = repairedMap.get(key);
                const selected = selectedPixel?.x === x && selectedPixel?.y === y;

                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      "canvasPixel",
                      repaired ? "repaired" : "",
                      selected ? "selected" : "",
                    ].join(" ")}
                    style={{
                      backgroundColor: repaired
                        ? repaired.color
                        : selected
                        ? selectedColor.value
                        : undefined,
                    }}
                    onClick={() => selectPixel(x, y)}
                    aria-label={`Pixel X${x} Y${y}`}
                    disabled={isWriting || isConfirming}
                  />
                );
              })}
            </div>

            <div className="legend">
              <span>
                <i className="legendEmpty" />
                Empty
              </span>
              <span>
                <i className="legendSelected" />
                Selected
              </span>
              <span>
                <i className="legendRepaired" />
                Repaired
              </span>
            </div>
          </div>

          <div className="controlPanel">
            <div className="panelBox">
              <p className="panelLabel">Step 01</p>
              <h3>Connect wallet</h3>

              <div className="connectWrap">
                <ConnectButton />
              </div>

              <p className="smallNote">One wallet. One pixel.</p>
            </div>

            <div className="panelBox">
              <p className="panelLabel">Step 02</p>
              <h3>Choose patch color</h3>

              <div className="colorGrid">
                {PATCH_COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    className={[
                      "colorButton",
                      selectedColor.name === color.name ? "activeColor" : "",
                    ].join(" ")}
                    onClick={() => setSelectedColor(color)}
                    title={color.name}
                    disabled={isWriting || isConfirming}
                  >
                    <span style={{ backgroundColor: color.value }} />
                  </button>
                ))}
              </div>

              <p className="selectedInfo">
                Selected color: <b>{selectedColor.name}</b>
              </p>
            </div>

            <div className="panelBox">
              <p className="panelLabel">Step 03</p>
              <h3>Repair coordinate</h3>

              <div className="coordinateBox">
                {selectedPixel ? (
                  <>
                    <span>Selected Pixel</span>
                    <strong>
                      X{selectedPixel.x}-Y{selectedPixel.y}
                    </strong>
                  </>
                ) : (
                  <>
                    <span>No pixel selected</span>
                    <strong>Pick one on canvas</strong>
                  </>
                )}
              </div>

              {!isCorrectNetwork && isConnected && (
                <button
                  className="switchButton"
                  onClick={() => switchChain?.({ chainId: TARGET_CHAIN.id })}
                  disabled={isWriting || isConfirming}
                >
                  Switch to {CHAIN_NAME}
                </button>
              )}

              <button
                className="submitButton"
                onClick={submitRepair}
                disabled={
                  isWriting ||
                  isConfirming ||
                  repairOpenLoading ||
                  !repairIsOpen
                }
              >
                {isWriting
                  ? "Confirm in Wallet..."
                  : isConfirming
                  ? "Repairing..."
                  : repairOpenLoading
                  ? "Loading..."
                  : !repairIsOpen
                  ? "Repair Closed"
                  : "Repair Pixel"}
              </button>

              {currentWalletEntry && (
                <div className="alreadyBox">
                  <span>Wallet already repaired</span>
                  <strong>
                    X{currentWalletEntry.x}-Y{currentWalletEntry.y}
                  </strong>
                </div>
              )}

              {error && <p className="errorBox">{error}</p>}
            </div>
          </div>
        </div>
      </section>

      {receipt && (
        <section className="receiptSection">
          <div className="receiptCard">
            <div className="receiptHeader">
              <p>Fixel Receipt</p>
              <span>Repair Mint Secured</span>
            </div>

            <div className="receiptBody">
              <div>
                <span>Wallet</span>
                <strong>{shortWallet(receipt.wallet)}</strong>
              </div>

              <div>
                <span>Coordinate</span>
                <strong>
                  X{receipt.x}-Y{receipt.y}
                </strong>
              </div>

              <div>
                <span>Patch Color</span>
                <strong>{receipt.colorName}</strong>
              </div>

              <div>
                <span>Status</span>
                <strong>Repaired</strong>
              </div>
            </div>

            <button className="copyButton" onClick={copyReceipt}>
              {copied ? "Copied" : "Copy Receipt"}
            </button>
          </div>
        </section>
      )}

      <section className="mintSection" id="mint">
        <div className="sectionHeader">
          <p>Mint System</p>
          <h2>Repair Mint</h2>
          <span>
            Your mint identity comes from the pixel you repaired before mint.
          </span>
        </div>

        <div className="infoCards">
          <div className="infoCard">
            <span>01</span>
            <h3>Repair Phase</h3>
            <p>
              Connect your wallet and repair one empty pixel. One wallet can only repair one coordinate.
            </p>
          </div>

          <div className="infoCard">
            <span>02</span>
            <h3>Repair Mint</h3>
            <p>
              Repaired wallets receive mint access and metadata based on their coordinate and patch color.
            </p>
          </div>

          <div className="infoCard">
            <span>03</span>
            <h3>Discord Roles</h3>
            <p>
              Repaired wallets can enter Discord with roles based on their repaired pixel, patch color, and zone.
            </p>
          </div>
        </div>
      </section>

      <section className="utilitySection" id="utility">
        <div className="sectionHeader">
          <p>Utility</p>
          <h2>Simple but useful</h2>
          <span>Utility is connected to pixel identity.</span>
        </div>

        <div className="utilityList">
          <div>
            <h3>Pixel Workbench</h3>
            <p>
              Holders can generate banners, receipts, and stickers from their Fixel.
            </p>
          </div>

          <div>
            <h3>Community Canvas</h3>
            <p>
              All repaired pixels can be combined into one final community artwork.
            </p>
          </div>

          <div>
            <h3>Role Access</h3>
            <p>
              Discord roles can be based on repaired wallet data from the canvas.
            </p>
          </div>
        </div>
      </section>

      <footer className="footbar">
        <p>© 2026 Fixels. All rights reserved.</p>

        <div className="footLinks">
          <a href={X_LINK} target="_blank" rel="noreferrer" aria-label="Fixels X">
            <img src="/x.png" alt="X" />
          </a>

          <a
            href={DISCORD_LINK}
            target="_blank"
            rel="noreferrer"
            aria-label="Fixels Discord"
          >
            <img src="/discord.png" alt="Discord" />
          </a>
        </div>
      </footer>
    </main>
  );
}