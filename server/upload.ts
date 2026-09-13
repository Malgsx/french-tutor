import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Node 26+ denies network, writes, addons and child processes by default here.
// This is defense in depth, not an OS sandbox against a compromised runtime.
export function extractDocument(
  buffer: Buffer,
  format: string,
): Promise<string> {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024)
    return Promise.reject(new Error("File size"));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--permission",
        "--no-allow-net",
        `--allow-fs-read=${fileURLToPath(new URL("../node_modules/", import.meta.url))}`,
        `--allow-fs-read=${fileURLToPath(new URL("./extract.mjs", import.meta.url))}`,
        "--max-old-space-size=128",
        fileURLToPath(new URL("./extract.mjs", import.meta.url)),
        format,
      ],
      {
        stdio: ["pipe", "pipe", "ignore"],
        env: { PATH: process.env.PATH },
      },
    );
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 25000) child.kill("SIGKILL");
    });
    child.on("error", reject);
    child.stdin.on("error", () => {
      /* Early rejection closes the input pipe. */
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !output.trim())
        reject(new Error("Document extraction failed"));
      else resolve(output.trim().slice(0, 20000));
    });
    child.stdin.end(buffer);
  });
}
