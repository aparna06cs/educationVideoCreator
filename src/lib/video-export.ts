import type { Lesson, Scene } from "./lesson-types";

/**
 * Renders a lesson to an actual downloadable video file, entirely in the browser:
 * scene images are drawn to a canvas (with a slow Ken Burns zoom) while each scene's
 * narration audio is routed through Web Audio into the same MediaStream that
 * MediaRecorder captures. No server, no transcoding cost.
 *
 * Known limitation: background music is not mixed into the export in this version —
 * only narration audio is captured.
 */

export type ExportProgress = { sceneIndex: number; total: number };

const WIDTH = 1280;
const HEIGHT = 720;

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load an illustration for export."));
    img.src = url;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, zoom: number) {
  const canvasRatio = WIDTH / HEIGHT;
  const imgRatio = img.width / img.height || canvasRatio;
  let drawWidth: number;
  let drawHeight: number;
  if (imgRatio > canvasRatio) {
    drawHeight = HEIGHT * zoom;
    drawWidth = drawHeight * imgRatio;
  } else {
    drawWidth = WIDTH * zoom;
    drawHeight = drawWidth / imgRatio;
  }
  const x = (WIDTH - drawWidth) / 2;
  const y = (HEIGHT - drawHeight) / 2;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCaption(ctx: CanvasRenderingContext2D, caption: string) {
  const gradient = ctx.createLinearGradient(0, HEIGHT * 0.55, 0, HEIGHT);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, HEIGHT * 0.55, WIDTH, HEIGHT * 0.45);

  if (!caption) return;
  ctx.fillStyle = "white";
  ctx.font = "600 40px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "bottom";

  const lines = wrapLines(ctx, caption, WIDTH - 100);
  const lineHeight = 50;
  let y = HEIGHT - 60 - (lines.length - 1) * lineHeight;
  for (const line of lines) {
    ctx.fillText(line, 50, y);
    y += lineHeight;
  }
}

async function renderScene(
  ctx: CanvasRenderingContext2D,
  audioCtx: AudioContext,
  destination: MediaStreamAudioDestinationNode,
  img: HTMLImageElement | null,
  scene: Scene,
): Promise<void> {
  let audioEl: HTMLAudioElement | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;

  if (scene.audioUrl) {
    audioEl = new Audio(scene.audioUrl);
    audioEl.crossOrigin = "anonymous";
    try {
      sourceNode = audioCtx.createMediaElementSource(audioEl);
      sourceNode.connect(destination);
      sourceNode.connect(audioCtx.destination);
    } catch {
      sourceNode = null;
    }
  }

  const durationMs = Math.max(1, scene.duration) * 1000;
  const start = performance.now();
  let stopped = false;

  const draw = () => {
    if (stopped) return;
    if (img) {
      const elapsed = performance.now() - start;
      const zoom = 1 + Math.min(1, elapsed / durationMs) * 0.08;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawCover(ctx, img, zoom);
    } else {
      ctx.fillStyle = "#1c1c1c";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    drawCaption(ctx, scene.caption || scene.title);
    if (!stopped) requestAnimationFrame(draw);
  };
  draw();

  if (audioEl) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      audioEl!.addEventListener("ended", finish, { once: true });
      audioEl!.addEventListener("error", finish, { once: true });
      void audioEl!.play().catch(finish);
      setTimeout(finish, durationMs + 1500);
    });
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  }

  stopped = true;
  sourceNode?.disconnect();
  audioEl?.pause();
}

export async function exportLessonVideo(
  lesson: Lesson,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video export isn't supported in this browser. Try a recent Chrome, Edge or Firefox.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a canvas for video export.");

  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new Ctor();
  const destination = audioCtx.createMediaStreamDestination();

  const videoTrack = canvas.captureStream(30).getVideoTracks()[0]!;
  const combined = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);

  const mimeType = pickMimeType();
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(combined, { mimeType });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();

  try {
    for (let i = 0; i < lesson.scenes.length; i++) {
      const scene = lesson.scenes[i]!;
      onProgress?.({ sceneIndex: i, total: lesson.scenes.length });

      let img: HTMLImageElement | null = null;
      if (scene.imageUrl) {
        img = await loadImage(scene.imageUrl).catch(() => null);
      }

      await renderScene(ctx, audioCtx, destination, img, scene);
    }
  } finally {
    recorder.stop();
    await stopped;
    await audioCtx.close().catch(() => {});
  }

  return new Blob(chunks, { type: mimeType.split(";")[0] ?? "video/webm" });
}
