import { getServerSession } from "next-auth";
import { getAddress, isAddress, verifyMessage } from "viem";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { addDiscordRole, addDiscordRoles } from "@/lib/discord";
import {
  CONTRACT_ADDRESS,
  FIXELS_VERIFY_ABI,
  publicClient,
} from "@/lib/contract";

type VerifyBody = {
  address?: string;
  message?: string;
  signature?: `0x${string}`;
};

const COLOR_NAMES = [
  "Repair Red",
  "Signal Blue",
  "Mint Green",
  "Dead Yellow",
  "Cyber Purple",
  "Ghost White",
  "Glitch Cyan",
  "Void Black",
];

function getTimestampFromMessage(message: string) {
  const match = message.match(/Timestamp: (\d+)/);
  if (!match) return null;

  return Number(match[1]);
}

function getColorRoleId(colorIndex: number) {
  const roles = [
    process.env.DISCORD_REPAIR_RED_ROLE_ID || "",
    process.env.DISCORD_SIGNAL_BLUE_ROLE_ID || "",
    process.env.DISCORD_MINT_GREEN_ROLE_ID || "",
    process.env.DISCORD_DEAD_YELLOW_ROLE_ID || "",
    process.env.DISCORD_CYBER_PURPLE_ROLE_ID || "",
    process.env.DISCORD_GHOST_WHITE_ROLE_ID || "",
    process.env.DISCORD_GLITCH_CYAN_ROLE_ID || "",
    process.env.DISCORD_VOID_BLACK_ROLE_ID || "",
  ];

  return roles[colorIndex] || "";
}

function getColorName(colorIndex: number) {
  return COLOR_NAMES[colorIndex] || "Unknown";
}

function getZoneRoleId(x: number) {
  if (x < 21) {
    return process.env.DISCORD_SIGNAL_ZONE_ROLE_ID || "";
  }

  if (x < 43) {
    return process.env.DISCORD_CORE_ZONE_ROLE_ID || "";
  }

  return process.env.DISCORD_GLITCH_ZONE_ROLE_ID || "";
}

function getZoneName(x: number) {
  if (x < 21) return "Signal Zone";
  if (x < 43) return "Core Zone";

  return "Glitch Zone";
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const discordId = session?.user?.id;

    if (!discordId) {
      return Response.json(
        {
          ok: false,
          message: "Login Discord first.",
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as VerifyBody;
    const { address, message, signature } = body;

    if (!address || !message || !signature) {
      return Response.json(
        {
          ok: false,
          message: "Missing verify data.",
        },
        { status: 400 }
      );
    }

    if (!isAddress(address)) {
      return Response.json(
        {
          ok: false,
          message: "Invalid wallet address.",
        },
        { status: 400 }
      );
    }

    const wallet = getAddress(address);

    const expectedPrefix = `Fixels Verify\nDiscord ID: ${discordId}\nWallet: ${wallet}\n`;

    if (!message.startsWith(expectedPrefix)) {
      return Response.json(
        {
          ok: false,
          message: "Invalid verify message.",
        },
        { status: 400 }
      );
    }

    const timestamp = getTimestampFromMessage(message);

    if (!timestamp || Date.now() - timestamp > 10 * 60 * 1000) {
      return Response.json(
        {
          ok: false,
          message: "Verify message expired. Try again.",
        },
        { status: 400 }
      );
    }

    const validSignature = await verifyMessage({
      address: wallet,
      message,
      signature,
    });

    if (!validSignature) {
      return Response.json(
        {
          ok: false,
          message: "Signature does not match wallet.",
        },
        { status: 401 }
      );
    }

    const repairData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: FIXELS_VERIFY_ABI,
      functionName: "getRepair",
      args: [wallet],
    });

    const [repaired, x, y, colorIndex, repairedAt] = repairData;

    if (!repaired) {
      return Response.json(
        {
          ok: false,
          message: "This wallet has not repaired a pixel yet.",
        },
        { status: 403 }
      );
    }

    const xNumber = Number(x);
    const yNumber = Number(y);
    const colorIndexNumber = Number(colorIndex);

    const fixelRoleId = process.env.DISCORD_FIXEL_ROLE_ID || "";
    const colorRoleId = getColorRoleId(colorIndexNumber);
    const zoneRoleId = getZoneRoleId(xNumber);

    await addDiscordRole(discordId, fixelRoleId);
    await addDiscordRoles(discordId, [colorRoleId, zoneRoleId]);

    return Response.json({
      ok: true,
      message: "Verified. Fixel roles unlocked.",
      repair: {
        wallet,
        x: xNumber,
        y: yNumber,
        colorIndex: colorIndexNumber,
        colorName: getColorName(colorIndexNumber),
        zone: getZoneName(xNumber),
        repairedAt: repairedAt.toString(),
      },
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Verification failed.",
      },
      { status: 500 }
    );
  }
}