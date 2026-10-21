/**
 * Attachment storage for Phase 2 (photos & audio per journal entry).
 *
 * Self-contained by design: content lives under its own localStorage key so
 * the main entry store and all existing analysis/migration logic stay
 * untouched. Entries only reference attachment IDs. The persistence layer can
 * later be swapped to IndexedDB without changing this API.
 */

import type { Attachment, AttachmentKind } from "../types";
import { t } from "./i18n";

/** Metadata stored on entries — canonical shape is types.ts Attachment. */
export type AttachmentMeta = Attachment;
export type { AttachmentKind };

const KEY = "belso-iranytu-attachments";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per attachment after compression

type Stored = { [id: string]: { meta: AttachmentMeta; dataUrl: string } };

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Stored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(all: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable — the UI surfaces the failure via saveBlob.
    throw new Error(t("attachments.errorStorage"));
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** All attachments, newest first. */
export function listAttachmentMeta(): AttachmentMeta[] {
  return Object.values(read())
    .map((rec) => rec.meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getAttachment(id: string): { meta: AttachmentMeta; dataUrl: string } | null {
  return read()[id] ?? null;
}

/** Data URL usable directly as <img>/<audio> src. */
export function getAttachmentDataUrl(id: string): string | null {
  return read()[id]?.dataUrl ?? null;
}

/** Convert a Blob to a base64 data URL without FileReader (works in bun too). */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/**
 * Downscale photos to max 1280px JPEG in browsers; elsewhere returns as-is.
 *
 * Exported rather than private because the background image's own store
 * (`lib/imageBackground`) needs the same pipeline, and a second copy of a
 * canvas downscale would be a second thing to keep in step: it would drift the
 * first time either the size or the JPEG quality changed, and the drift would
 * be invisible until a reader's backdrop quietly stopped looking like their
 * journal photo's pipeline. Same function, same numbers, two stores.
 */
export async function compressImage(blob: Blob): Promise<Blob> {
  if (typeof document === "undefined") return blob;
  try {
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.82),
    );
  } catch {
    return blob;
  }
}

/**
 * Store a photo or audio Blob and return its metadata (what entries keep).
 * Throws when the result exceeds the size cap or storage is unavailable.
 */
export async function saveBlob(
  kind: AttachmentKind,
  raw: Blob,
  name?: string,
): Promise<AttachmentMeta> {
  const blob = kind === "photo" ? await compressImage(raw) : raw;
  if (blob.size > MAX_BYTES) {
    throw new Error(t("attachments.errorTooLarge"));
  }
  const meta: AttachmentMeta = { id: newId(), kind, createdAt: Date.now(), name };
  const all = read();
  all[meta.id] = { meta, dataUrl: await blobToDataUrl(blob) };
  write(all);
  return meta;
}

/** Store a picked photo File (compressed in browsers). */
export async function savePhotoFile(file: File): Promise<AttachmentMeta> {
  return saveBlob("photo", file, file.name);
}

/** Store a picked video file (size-capped; no client-side transcoding). */
export async function saveVideoFile(file: File): Promise<AttachmentMeta> {
  if (!file.type.startsWith("video/")) {
    throw new Error(t("attachments.errorVideoType"));
  }
  return saveBlob("video", file, file.name);
}

export function removeAttachment(id: string) {
  const all = read();
  if (id in all) {
    delete all[id];
    write(all);
  }
}

/** Remove several attachments at once (used when an entry is deleted). */
export function removeAttachments(ids: string[]) {
  const all = read();
  let changed = false;
  for (const id of ids) {
    if (id in all) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) write(all);
}
