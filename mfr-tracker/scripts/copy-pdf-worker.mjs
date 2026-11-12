import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (!existsSync(src)) {
  console.warn(`copy-pdf-worker: ${src} not found, skipping`);
  process.exit(0);
}
mkdirSync("public", { recursive: true });
copyFileSync(src, "public/pdf.worker.min.mjs");
console.log("copy-pdf-worker: copied pdf.worker.min.mjs to public/");
