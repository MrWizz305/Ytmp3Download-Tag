"use client";

import { useRef, useState } from "react";
import type { VideoInfo } from "@/lib/types";
import { formatDuration } from "@/lib/youtube";
import CropModal from "./CropModal";

type CoverMode = "thumbnail" | "upload";

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function Converter() {
  const [url, setUrl] = useState("");
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  const [title, setTitle] = useState("");
  const [album, setAlbum] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [coverMode, setCoverMode] = useState<CoverMode>("thumbnail");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFetchInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || fetchingInfo) return;

    setError(null);
    setFetchingInfo(true);
    setVideoInfo(null);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't fetch that video.");
        return;
      }

      const info = data as VideoInfo;
      setVideoInfo(info);
      setTitle(info.title);
      setAlbum("");
      setAlbumArtist(info.uploader ?? "");
      setCoverMode("thumbnail");
      setCoverFile(null);
      setCoverPreview(null);
      setRawImageSrc(null);
      setCropModalOpen(false);
    } catch {
      setError("Something went wrong reaching the server. Check your connection and try again.");
    } finally {
      setFetchingInfo(false);
    }
  }

  function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setRawImageSrc(objectUrl);
    setCropModalOpen(true);
    e.target.value = "";
  }

  function handleCropComplete(blob: Blob) {
    const file = new File([blob], "cover.jpg", { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(blob);
    setCoverFile(file);
    setCoverPreview(previewUrl);
    setCoverMode("upload");
    setCropModalOpen(false);
  }

  function handleCropCancel() {
    setCropModalOpen(false);
    if (!coverFile) {
      // No prior successful crop to fall back on - drop the raw source too.
      setRawImageSrc(null);
    }
  }

  async function handleConvert() {
    if (!videoInfo || converting) return;
    setError(null);
    setConverting(true);

    try {
      const form = new FormData();
      form.set("url", url.trim());
      form.set("title", title.trim() || videoInfo.title);
      form.set("album", album.trim());
      form.set("albumArtist", albumArtist.trim());
      form.set("coverMode", coverMode);
      form.set("thumbnailUrl", videoInfo.thumbnail);
      form.set("duration", String(videoInfo.duration));
      if (coverMode === "upload" && coverFile) {
        form.set("cover", coverFile);
      }

      const res = await fetch("/api/convert", { method: "POST", body: form });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          setError(data.error ?? "Conversion failed.");
        } else {
          setError("Conversion failed.");
        }
        return;
      }

      const blob = await res.blob();
      const filename = filenameFromDisposition(
        res.headers.get("content-disposition"),
        `${(title.trim() || videoInfo.title).replace(/[/\\?%*:|"<>]/g, "")}.mp3`,
      );

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      setError("Something went wrong during conversion. Check your connection and try again.");
    } finally {
      setConverting(false);
    }
  }

  const activeCoverSrc = coverMode === "thumbnail" ? videoInfo?.thumbnail : coverPreview;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleFetchInfo} className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="field-input flex-1"
        />
        <button type="submit" disabled={fetchingInfo} className="btn btn-primary">
          {fetchingInfo ? (
            <>
              <span className="spinner" /> Fetching…
            </>
          ) : (
            "Fetch"
          )}
        </button>
      </form>

      {error && <p className="error-banner">{error}</p>}

      {videoInfo && (
        <div className="card p-5 flex flex-col gap-6">
          <div className="flex gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={videoInfo.thumbnail}
              alt=""
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-lg object-cover flex-none border border-[var(--border)]"
            />
            <div className="min-w-0">
              <p className="font-semibold leading-snug line-clamp-2">{videoInfo.title}</p>
              <p className="text-sm text-[var(--muted)] mt-1">{videoInfo.uploader}</p>
              <p className="text-sm text-[var(--muted)]">{formatDuration(videoInfo.duration)}</p>
            </div>
          </div>

          <hr className="divider" />

          <div className="flex flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="title">
                Track title
              </label>
              <input
                id="title"
                className="field-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label" htmlFor="album">
                  Album
                </label>
                <input
                  id="album"
                  className="field-input"
                  placeholder="Optional"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="albumArtist">
                  Artist
                </label>
                <input
                  id="albumArtist"
                  className="field-input"
                  placeholder="Optional"
                  value={albumArtist}
                  onChange={(e) => setAlbumArtist(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="field-label">Cover art</label>
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    data-active={coverMode === "thumbnail"}
                    onClick={() => setCoverMode("thumbnail")}
                  >
                    Use thumbnail
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    data-active={coverMode === "upload"}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCoverFileChange}
                  />
                  {coverMode === "upload" && rawImageSrc && (
                    <button
                      type="button"
                      className="text-sm text-[var(--muted)] underline text-left"
                      onClick={() => setCropModalOpen(true)}
                    >
                      Recrop
                    </button>
                  )}
                </div>
                {activeCoverSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeCoverSrc}
                    alt="Cover art preview"
                    className="w-20 h-20 rounded-lg object-cover border border-[var(--border)]"
                  />
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConvert}
            disabled={converting}
            className="btn btn-primary w-full"
          >
            {converting ? (
              <>
                <span className="spinner" /> Converting… this can take a minute
              </>
            ) : (
              "Convert & Download"
            )}
          </button>
        </div>
      )}

      {cropModalOpen && rawImageSrc && (
        <CropModal imageSrc={rawImageSrc} onCancel={handleCropCancel} onComplete={handleCropComplete} />
      )}
    </div>
  );
}
