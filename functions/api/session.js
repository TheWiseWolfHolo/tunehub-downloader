import { getSession, json } from "./_lib/utils.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return json({ success: true, authenticated: false });
  }

  return json({
    success: true,
    authenticated: true,
    username: session.username,
    expiresAt: session.exp,
  });
}
