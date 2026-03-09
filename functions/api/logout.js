import { clearSessionCookie, json } from "./_lib/utils.js";

export async function onRequestPost({ request }) {
  return json(
    { success: true },
    200,
    {
      "set-cookie": clearSessionCookie(request),
    },
  );
}
