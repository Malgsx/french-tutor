// A reused server keeps the key and LIVE_ENABLED it was started with, so the
// launcher's environment cannot fix a 401 until that server is stopped.
export function reuseNotice(state, env = process.env) {
  const lines = [
    "Using the running Miette server; its live configuration is unchanged.",
  ];
  if (state.liveAvailable) return lines;
  if (state.liveReason) lines.push(`That server reports: ${state.liveReason}`);
  if (env.LIVE_ENABLED === "true" || env.OPENAI_API_KEY)
    lines.push(
      "Your LIVE_ENABLED / OPENAI_API_KEY settings are NOT applied to it. Stop the old server (Ctrl+C in its Terminal, or close the earlier Miette window) and run npm run desktop:live again.",
    );
  return lines;
}
