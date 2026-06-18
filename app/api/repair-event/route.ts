import { decodeAbiParameters, keccak256, toBytes } from "viem";

export const runtime = "nodejs";

const CONTRACT_ADDRESS =
  "0x2cfF3d4F83D5E7A3f6D087e936712d2C80a8E52e".toLowerCase();

const PIXEL_REPAIRED_TOPIC = keccak256(
  toBytes("PixelRepaired(address,uint8,uint8,uint8)")
).toLowerCase();

const PATCH_COLORS = [
  { name: "Repair Red", emoji: "🟥", hex: "#ff4d4d" },
  { name: "Signal Blue", emoji: "🟦", hex: "#4d8dff" },
  { name: "Mint Green", emoji: "🟩", hex: "#4dff88" },
  { name: "Dead Yellow", emoji: "🟨", hex: "#ffe15c" },
  { name: "Cyber Purple", emoji: "🟪", hex: "#9b5cff" },
  { name: "Ghost White", emoji: "⬜", hex: "#ffffff" },
  { name: "Glitch Cyan", emoji: "🟦", hex: "#59f0ff" },
  { name: "Void Black", emoji: "⬛", hex: "#111111" },
];

function hexToDecimal(hex: string) {
  return parseInt(hex.replace("#", ""), 16);
}

function getLogAddress(log: any) {
  return (
    log?.address ||
    log?.account?.address ||
    log?.contractAddress ||
    ""
  ).toLowerCase();
}

function collectLogs(input: any, output: any[] = []) {
  if (!input) return output;

  if (Array.isArray(input)) {
    for (const item of input) collectLogs(item, output);
    return output;
  }

  if (typeof input === "object") {
    if (Array.isArray(input.topics) && typeof input.data === "string") {
      output.push(input);
    }

    for (const value of Object.values(input)) {
      collectLogs(value, output);
    }
  }

  return output;
}

async function sendDiscordMessage({
  x,
  y,
  colorName,
  colorEmoji,
  colorHex,
}: {
  x: number;
  y: number;
  colorName: string;
  colorEmoji: string;
  colorHex: string;
}) {
  const webhookUrl = process.env.DISCORD_REPAIR_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("Missing DISCORD_REPAIR_WEBHOOK_URL");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "Fixels Repair Log",
      content:
        `🛠️ **Pixel Repaired**\n\n` +
        `Coordinate: **X${x}-Y${y}**\n` +
        `Color: ${colorEmoji} **${colorName}**`,
      embeds: [
        {
          title: "New Pixel Repaired",
          color: hexToDecimal(colorHex),
          fields: [
            {
              name: "Coordinate",
              value: `**X${x}-Y${y}**`,
              inline: true,
            },
            {
              name: "Patch Color",
              value: `${colorEmoji} **${colorName}**`,
              inline: true,
            },
          ],
          footer: {
            text: "One pixel repaired on the Broken Canvas.",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${text}`);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (process.env.ALCHEMY_WEBHOOK_SECRET) {
      if (secret !== process.env.ALCHEMY_WEBHOOK_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const logs = collectLogs(body);

    let sent = 0;

    for (const log of logs) {
      const topics = log.topics || [];
      const data = log.data;

      if (!topics[0]) continue;

      const topic0 = String(topics[0]).toLowerCase();

      if (topic0 !== PIXEL_REPAIRED_TOPIC) continue;

      const logAddress = getLogAddress(log);

      if (logAddress && logAddress !== CONTRACT_ADDRESS) continue;

      const decoded = decodeAbiParameters(
        [
          { type: "uint8", name: "x" },
          { type: "uint8", name: "y" },
          { type: "uint8", name: "colorIndex" },
        ],
        data
      );

      const x = Number(decoded[0]);
      const y = Number(decoded[1]);
      const colorIndex = Number(decoded[2]);

      const color = PATCH_COLORS[colorIndex] || PATCH_COLORS[0];

      await sendDiscordMessage({
        x,
        y,
        colorName: color.name,
        colorEmoji: color.emoji,
        colorHex: color.hex,
      });

      sent++;
    }

    return Response.json({
      ok: true,
      receivedLogs: logs.length,
      sent,
    });
  } catch (error) {
    console.error("Repair webhook error:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    message: "Fixels repair webhook is live.",
  });
}