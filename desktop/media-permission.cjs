// Shared by the Electron session handlers so getUserMedia is not denied
// when Chromium omits mediaTypes or labels the request "microphone".
function allowMediaRequest({
  permission,
  requestingOrigin,
  requestingUrl,
  mediaTypes,
  origin,
  fromWindow,
}) {
  if (!fromWindow || permission !== "media" || requestingOrigin !== origin)
    return false;
  if (requestingUrl) {
    try {
      if (new URL(requestingUrl).origin !== origin) return false;
    } catch {
      return false;
    }
  } else if (requestingOrigin !== origin) {
    return false;
  }
  const types = mediaTypes ?? [];
  if (types.length === 0) return true;
  return (
    types.length === 1 && (types[0] === "audio" || types[0] === "microphone")
  );
}
module.exports = { allowMediaRequest };
