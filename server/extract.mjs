import mammoth from "mammoth";
// Parser diagnostics must never become part of the extracted school text.
console.log = console.error;
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 5 * 1024 * 1024) process.exit(1);
  chunks.push(chunk);
}
const buffer = Buffer.concat(chunks);
let text = "";
try {
  if (process.argv[2] === "txt")
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  else if (
    process.argv[2] === "docx" &&
    buffer.subarray(0, 2).toString() === "PK"
  ) {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (
    process.argv[2] === "pdf" &&
    buffer.subarray(0, 5).toString() === "%PDF-"
  ) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });
    const document = await task.promise;
    if (document.numPages > 50) throw new Error("Too many pages");
    for (let i = 1; i <= document.numPages && text.length < 20000; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("") + "\n";
    }
    await task.destroy();
  } else throw new Error("Unsupported format");
  process.stdout.write(text.slice(0, 20000));
} catch {
  process.exitCode = 1;
}
