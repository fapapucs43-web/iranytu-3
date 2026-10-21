import { useRef, useState } from "react";
import { Mic, Paperclip, Square, X } from "../lib/icons";
import ContentIcon from "./ContentIcon";
import { t } from "../lib/i18n";
import {
  savePhotoFile,
  saveBlob,
  saveVideoFile,
  removeAttachment,
  getAttachmentDataUrl,
  type AttachmentMeta,
} from "../lib/attachments";

/**
 * Photo & audio attachments for the daily entry.
 *
 * Controlled: the caller owns the list (entries store only the metadata).
 * Mounted by `TodayView`, on the Ma fül, under the entry composer.
 */
export default function AttachmentPicker({
  value,
  onChange,
}: {
  value: AttachmentMeta[];
  onChange: (next: AttachmentMeta[]) => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const recorder = useRef<{
    stop: () => void;
    stream: MediaStream;
  } | null>(null);

  async function addPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const meta = await savePhotoFile(file);
      onChange([...value, meta]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attachments.photoSaveError"));
    } finally {
      setBusy(false);
    }
  }

  async function addVideoFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const meta = await saveVideoFile(file);
      onChange([...value, meta]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attachments.videoSaveError"));
    } finally {
      setBusy(false);
    }
  }

  async function addAudioFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const meta = await saveBlob("audio", file, file.name);
      onChange([...value, meta]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attachments.audioSaveError"));
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("attachments.recordUnsupported"));
      audioInput.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        await addAudioFile(new File([blob], "felvetel.webm", { type: blob.type }));
      };
      mr.start();
      recorder.current = {
        stop: () => mr.state !== "inactive" && mr.stop(),
        stream,
      };
      setRecording(true);
    } catch {
      setError(t("attachments.micFailed"));
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }

  function remove(id: string) {
    removeAttachment(id);
    onChange(value.filter((a) => a.id !== id));
  }

  return (
    <div className="toolbox-item">
      <h3><Paperclip size="1.1em" /> {t("attachments.title")}</h3>
      <div className="btn-grid">
        <button
          type="button"
          className="btn btn-soft"
          disabled={busy}
          onClick={() => photoInput.current?.click()}
        >
          <ContentIcon name="Camera" size="1.1em" /> {t("attachments.photo")}
        </button>
        {recording ? (
          <button type="button" className="btn btn-danger" onClick={stopRecording}>
            <Square size="1.1em" /> {t("attachments.stopRecording")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-soft"
            disabled={busy}
            onClick={startRecording}
          >
            <Mic size="1.1em" /> {t("attachments.recordAudio")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => audioInput.current?.click()}
        >
          <ContentIcon name="Music" size="1.1em" /> {t("attachments.audioFile")}
        </button>
        <button
          type="button"
          className="btn btn-soft"
          disabled={busy}
          onClick={() => videoInput.current?.click()}
        >
          <ContentIcon name="Film" size="1.1em" /> {t("attachments.video")}
        </button>
      </div>
      <p className="muted-note">{t("attachments.videoHint")}</p>

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addPhoto(f);
          e.target.value = "";
        }}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addAudioFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addVideoFile(f);
          e.target.value = "";
        }}
      />

      {error && <p className="muted-note"><ContentIcon name="AlertTriangle" size="1.1em" /> {error}</p>}

      {value.length > 0 && (
        <div className="attachment-list">
          {value.map((a) => {
            const url = getAttachmentDataUrl(a.id);
            return (
              <div key={a.id} className="attachment-item">
                {a.kind === "photo" ? (
                  url && <img src={url} alt={t("attachments.photoAlt")} className="attachment-thumb" />
                ) : a.kind === "video" ? (
                  url && <video controls src={url} preload="metadata" className="attachment-video" />
                ) : url ? (
                  <audio controls src={url} preload="none" />
                ) : (
                  <span className="muted-note">(?: {a.name ?? a.kind})</span>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("attachments.removeLabel")}
                  onClick={() => remove(a.id)}
                >
                  <X size="1.1em" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
