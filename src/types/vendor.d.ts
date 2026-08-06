declare module "mammoth/mammoth.browser.js" {
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string; messages: unknown[] }>;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const src: string;
  export default src;
}
