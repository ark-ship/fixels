"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { useAccount, useChainId, useSignMessage, useSwitchChain } from "wagmi";

const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 1);
const TARGET_CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME || "Ethereum";

type VerifyResult = {
  ok: boolean;
  message: string;
  repair?: {
    wallet: string;
    x: number;
    y: number;
    colorIndex: number;
    repairedAt: string;
  };
};

function shortWallet(wallet: string) {
  if (!wallet) return "";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function VerifyPage() {
  const { data: session, status } = useSession();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const wallet = address || "";
  const wrongNetwork = isConnected && chainId !== TARGET_CHAIN_ID;

  async function verifyWallet() {
    setResult(null);

    if (!session?.user?.id) {
      setResult({
        ok: false,
        message: "Login Discord first.",
      });
      return;
    }

    if (!isConnected || !wallet) {
      setResult({
        ok: false,
        message: "Connect your wallet first.",
      });
      return;
    }

    if (wrongNetwork) {
      setResult({
        ok: false,
        message: `Switch to ${TARGET_CHAIN_NAME} first.`,
      });

      switchChain?.({ chainId: TARGET_CHAIN_ID });
      return;
    }

    try {
      setIsVerifying(true);

      const message = `Fixels Verify
Discord ID: ${session.user.id}
Wallet: ${wallet}
Timestamp: ${Date.now()}`;

      const signature = await signMessageAsync({
        message,
      });

      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: wallet,
          message,
          signature,
        }),
      });

      const data = (await response.json()) as VerifyResult;

      setResult(data);
    } catch (error) {
      console.error(error);

      setResult({
        ok: false,
        message: "Verification cancelled or failed.",
      });
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <main className="verifyPage">
      <div className="verifyCard">
      <div className="brand">
  <img className="brandLogo" src="/fixels.png" alt="Fixels" />
  <p>FIXELS</p>
</div>
        <div className="verifyHeader">
          <p>Private Discord Access</p>
          <h1>Verify Wallet</h1>
          <span>
            Verify the same wallet you used to repair one pixel on the Broken Canvas.
          </span>
        </div>

        <div className="verifySteps">
          <div className="verifyStep">
            <span>01</span>

            <div>
              <h3>Login Discord</h3>
              <p>
                {status === "loading"
                  ? "Checking Discord session..."
                  : session?.user
                  ? `Logged in as ${session.user.name}`
                  : "Login with the Discord account you use in Fixels."}
              </p>
            </div>

            {session?.user ? (
              <button className="verifySmallButton" onClick={() => signOut()}>
                Logout
              </button>
            ) : (
              <button className="verifySmallButton" onClick={() => signIn("discord")}>
                Login Discord
              </button>
            )}
          </div>

          <div className="verifyStep">
            <span>02</span>

            <div>
              <h3>Connect Wallet</h3>
              <p>
                {wallet
                  ? `Connected: ${shortWallet(wallet)}`
                  : "Connect the wallet that repaired your pixel."}
              </p>
            </div>

            <ConnectButton />
          </div>

          <div className="verifyStep">
            <span>03</span>

            <div>
              <h3>Check Network</h3>
              <p>
                {wrongNetwork
                  ? `Wrong network. Switch to ${TARGET_CHAIN_NAME}.`
                  : `Network target: ${TARGET_CHAIN_NAME}`}
              </p>
            </div>

            {wrongNetwork && (
              <button
                className="verifySmallButton"
                onClick={() => switchChain?.({ chainId: TARGET_CHAIN_ID })}
              >
                Switch
              </button>
            )}
          </div>
        </div>

        <button
          className="verifyMainButton"
          onClick={verifyWallet}
          disabled={!session?.user || !wallet || isSigning || isVerifying}
        >
          {isSigning
            ? "Sign in Wallet..."
            : isVerifying
            ? "Verifying..."
            : "Verify Wallet"}
        </button>

        {result && (
          <div className={result.ok ? "verifyResult success" : "verifyResult error"}>
            <strong>{result.ok ? "Verified" : "Not Verified"}</strong>
            <p>{result.message}</p>

            {result.repair && (
              <div className="repairMiniData">
                <span>Coordinate</span>
                <b>
                  X{result.repair.x}-Y{result.repair.y}
                </b>
              </div>
            )}
          </div>
        )}

        <div className="verifyNote">
          <p>
            You must sign with your own wallet.
          </p>
          <p>The team will never ask for your seed phrase.</p>
        </div>
      </div>
    </main>
  );
}