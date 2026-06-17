const DISCORD_API = "https://discord.com/api/v10";

export async function addDiscordRole(userId: string, roleId: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId) {
    throw new Error("Missing DISCORD_GUILD_ID");
  }

  if (!botToken) {
    throw new Error("Missing DISCORD_BOT_TOKEN");
  }

  if (!roleId) {
    throw new Error("Missing role id");
  }

  const response = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord role failed: ${response.status} ${text}`);
  }

  return true;
}

export async function addDiscordRoles(userId: string, roleIds: string[]) {
  const cleanRoleIds = roleIds.filter(Boolean);

  for (const roleId of cleanRoleIds) {
    await addDiscordRole(userId, roleId);
  }

  return true;
}