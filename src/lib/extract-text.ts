/**
 * Client-side source extraction. Parsing runs in the browser so large files
 * never touch the edge runtime (which has no native binaries).
 */

const MAX_CHARS = 60000;
export const MIN_PDF_PAGES = 3;
export const SPLIT_PAGE_THRESHOLD = 5;

function clean(text: string) {
  return text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractPdf(file: File): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;

  if (pageCount < MIN_PDF_PAGES) {
    throw new Error(
      "This PDF has only " +
        pageCount +
        " page" +
        (pageCount === 1 ? "" : "s") +
        " - at least " +
        MIN_PDF_PAGES +
        " pages are needed to build a lesson from it.",
    );
  }

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
    if (pages.join(" ").length > MAX_CHARS) break;
  }
  return { text: pages.join("\n\n"), pageCount };
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function extractPptx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/(\d+)/)?.[1] ?? 0);
      return na - nb;
    });
  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name]!.async("string");
    const text = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => match[1])
      .join(" ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    slides.push(text);
  }
  return slides.join("\n\n");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function isSupportedFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".pptx") ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  );
}

export type ExtractedFile = { text: string; pageCount: number | null };

export async function extractFileText(file: File): Promise<ExtractedFile> {
  const name = file.name.toLowerCase();
  let raw = "";
  let pageCount: number | null = null;
  if (name.endsWith(".pdf")) {
    const result = await extractPdf(file);
    raw = result.text;
    pageCount = result.pageCount;
  } else if (name.endsWith(".docx")) raw = await extractDocx(file);
  else if (name.endsWith(".pptx")) raw = await extractPptx(file);
  else raw = await file.text();

  const text = clean(raw);
  if (text.length < 40) {
    throw new Error(
      "We couldn't read enough text from that file. Scanned or image-only documents aren't supported yet — try pasting the text instead.",
    );
  }
  return { text: text.slice(0, MAX_CHARS), pageCount };
}
