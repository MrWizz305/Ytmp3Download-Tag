"use client";

import { useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

const OUTPUT_SIZE_CAP = 1024;

function centerSquareCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, 1, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  );
}

function cropToSquareBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pixelRatio = window.devicePixelRatio || 1;

  const cropWidth = crop.width * scaleX;
  const cropHeight = crop.height * scaleY;
  const outputSize = Math.min(cropWidth, cropHeight, OUTPUT_SIZE_CAP);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(outputSize * pixelRatio);
  canvas.height = Math.round(outputSize * pixelRatio);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported.");
  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the cropped image."))),
      "image/jpeg",
      0.92,
    );
  });
}

export default function CropModal({
  imageSrc,
  onCancel,
  onComplete,
}: {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [working, setWorking] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  async function handleApply() {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0) return;
    setWorking(true);
    try {
      const blob = await cropToSquareBlob(imgRef.current, completedCrop);
      onComplete(blob);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md p-5 flex flex-col gap-4 bg-[var(--background)]">
        <div>
          <p className="font-semibold">Crop cover art</p>
          <p className="text-sm text-[var(--muted)] mt-1">Drag to select a square area.</p>
        </div>

        <div className="flex justify-center bg-[var(--card)] rounded-lg overflow-hidden">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={1}
            circularCrop={false}
            keepSelection
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Image to crop"
              className="max-h-[60vh]"
              onLoad={(e) => {
                const { width, height } = e.currentTarget;
                setCrop(centerSquareCrop(width, height));
              }}
            />
          </ReactCrop>
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply} disabled={working}>
            {working ? (
              <>
                <span className="spinner" /> Applying…
              </>
            ) : (
              "Use this crop"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
