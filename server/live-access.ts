// Server-side view of whether Live can be offered, with a reason a parent can act on.
export type LiveAccess = { available: boolean; reason: string | null };

export const LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions";
export const KEY_PAGE = "https://platform.openai.com/settings/organization/api-keys";

export function configuredAccess(live: boolean, key: string | undefined): LiveAccess {
  if (live && key) return { available: true, reason: null };
  return {
    available: false,
    reason: !live
      ? "Live voice is off: start the server with LIVE_ENABLED=true (npm run desktop:live) and a private OPENAI_API_KEY."
      : "Live voice is off: OPENAI_API_KEY is missing. Add it to .env or the terminal, then restart the server.",
  };
}

// Human-readable explanation for an OpenAI refusal, used by the preflight and
// by session creation so a bad key is never reported as a generic failure.
export function describeRefusal(status: number, detail = ""): string {
  const note = detail ? ` OpenAI said: ${detail}` : "";
  const restart =
    "Then stop the running Miette server (Ctrl+C in its Terminal) and start it again.";
  if (status === 401 && /scope|insufficient permissions/i.test(detail))
    return `The OPENAI_API_KEY is valid but not allowed to use GPT-Live (401 missing scope).${note} This is a restricted key: at ${KEY_PAGE} edit it and set Model capabilities to “Request” (or create a key with all permissions). ${restart}`;
  switch (status) {
    case 401:
      return `OpenAI rejected the server’s OPENAI_API_KEY (401).${note} Create a fresh key at ${KEY_PAGE}, put it in .env or the terminal. ${restart}`;
    case 403:
      return `This OPENAI_API_KEY is not allowed to use GPT-Live (403).${note} Check the project’s model access and permissions. ${restart}`;
    case 429:
      return `OpenAI is rate-limiting or out of quota for this key (429).${note} Check billing and usage limits, then try again later.`;
    default:
      return `Live service refused session creation (${status}).${note} No automatic retry.`;
  }
}

export async function refusalDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string | null };
    };
    return body.error?.message ?? body.error?.code ?? "";
  } catch {
    return "";
  }
}

// Probe the real Live endpoint with an empty body. OpenAI checks the key and its
// scopes before validating the body, so a good key answers 400 (nothing created,
// nothing billed) while a bad or under-scoped key answers exactly the 401 a
// learner would otherwise hit. Network trouble does not block Live.
export async function checkKey(
  key: string,
  request: typeof fetch = fetch,
): Promise<LiveAccess> {
  try {
    const response = await request(LIVE_SESSIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403)
      return {
        available: false,
        reason: describeRefusal(response.status, await refusalDetail(response)),
      };
    return { available: true, reason: null };
  } catch {
    return { available: true, reason: null };
  }
}
