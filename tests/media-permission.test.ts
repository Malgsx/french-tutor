import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { allowMediaRequest } = createRequire(import.meta.url)(
  "../desktop/media-permission.cjs",
) as {
  allowMediaRequest: (details: {
    permission: string;
    requestingOrigin: string;
    requestingUrl: string;
    mediaTypes?: string[];
    origin: string;
    fromWindow: boolean;
  }) => boolean;
};

const origin = "http://localhost:3030";
const allowed = {
  permission: "media",
  requestingOrigin: origin,
  requestingUrl: `${origin}/`,
  origin,
  fromWindow: true,
};

test("Electron grants audio-only microphone requests from the app origin", () => {
  assert.equal(allowMediaRequest({ ...allowed, mediaTypes: ["audio"] }), true);
  assert.equal(
    allowMediaRequest({ ...allowed, mediaTypes: ["microphone"] }),
    true,
  );
  assert.equal(allowMediaRequest({ ...allowed, mediaTypes: [] }), true);
  assert.equal(allowMediaRequest({ ...allowed }), true);
  assert.equal(allowMediaRequest({ ...allowed, mediaTypes: ["video"] }), false);
  assert.equal(
    allowMediaRequest({ ...allowed, requestingUrl: "https://evil.test/" }),
    false,
  );
  assert.equal(allowMediaRequest({ ...allowed, fromWindow: false }), false);
});
