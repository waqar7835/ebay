"use client";

import { useEffect, useRef, useState } from "react";

const STAGE_SIZE = 320;
const CROP_SIZE = 220;
const MAX_OUTPUT_SIZE = 800;

interface ImageCropModalProps {
  file: File;
  onCancel: () => void;
  onSave: (file: File) => void;
}

/** Shows the full image with the saved square overlaid, lets the user drag/zoom/rotate it,
 * then bakes a resized square (max 800x800) JPEG matching exactly what was inside the square. */
export default function ImageCropModal({ file, onCancel, onSave }: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!ready) return;
    drawStage(canvasRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rotation, zoom, offset]);

  /** Renders the transformed image onto `size`, using `unit` as the square-crop reference for
   * scale/offset math. When size === unit this draws exactly the saved crop; when size > unit
   * (the interactive stage) the extra surrounding image area is visible too. */
  function renderImage(ctx: CanvasRenderingContext2D, size: number, unit: number) {
    const img = imgRef.current;
    if (!img) return;

    const rad = (rotation * Math.PI) / 180;
    const swapped = rotation % 180 !== 0;
    const iw = swapped ? img.naturalHeight : img.naturalWidth;
    const ih = swapped ? img.naturalWidth : img.naturalHeight;
    const coverScale = unit / Math.min(iw, ih);
    const scale = coverScale * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    ctx.save();
    ctx.translate(size / 2 + offset.x * unit, size / 2 + offset.y * unit);
    ctx.rotate(rad);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  function drawStage(canvas: HTMLCanvasElement | null) {
    if (!canvas || !imgRef.current) return;
    canvas.width = STAGE_SIZE;
    canvas.height = STAGE_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, STAGE_SIZE, STAGE_SIZE);
    renderImage(ctx, STAGE_SIZE, CROP_SIZE);

    // Dim everything outside the crop square so it's clear what will be saved.
    const half = CROP_SIZE / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, STAGE_SIZE, STAGE_SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(STAGE_SIZE / 2 - half, STAGE_SIZE / 2 - half, CROP_SIZE, CROP_SIZE);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(STAGE_SIZE / 2 - half + 1, STAGE_SIZE / 2 - half + 1, CROP_SIZE - 2, CROP_SIZE - 2);
    ctx.restore();
  }

  function handleMouseDown(e: React.MouseEvent) {
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragState.current) return;
    const dx = (e.clientX - dragState.current.startX) / CROP_SIZE;
    const dy = (e.clientY - dragState.current.startY) / CROP_SIZE;
    setOffset({
      x: clamp(dragState.current.startOffset.x + dx, -1.5, 1.5),
      y: clamp(dragState.current.startOffset.y + dy, -1.5, 1.5),
    });
  }
  function handleMouseUp() {
    dragState.current = null;
  }

  function rotateBy(delta: number) {
    setRotation((r) => (r + delta + 360) % 360);
  }

  function handleSave() {
    const img = imgRef.current;
    if (!img) return;
    const outputSize = Math.max(100, Math.min(MAX_OUTPUT_SIZE, Math.min(img.naturalWidth, img.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputSize, outputSize);
    renderImage(ctx, outputSize, outputSize);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        onSave(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded bg-white p-4 shadow-lg">
        <p className="mb-3 text-sm font-medium text-gray-900">Adjust image — the bright square is what gets saved</p>

        <div
          className="mx-auto cursor-move select-none overflow-hidden rounded border"
          style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} width={STAGE_SIZE} height={STAGE_SIZE} />
        </div>
        <p className="mt-1 text-center text-xs text-gray-400">Drag the image to recenter it</p>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <div className="flex gap-2">
            <button type="button" onClick={() => rotateBy(-90)} className="rounded border px-2 py-1 text-gray-700 hover:bg-gray-50">
              Rotate ⟲
            </button>
            <button type="button" onClick={() => rotateBy(90)} className="rounded border px-2 py-1 text-gray-700 hover:bg-gray-50">
              Rotate ⟳
            </button>
          </div>
          <label className="flex flex-1 items-center gap-2 text-xs text-gray-500">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2 text-sm">
          <button type="button" onClick={onCancel} className="rounded border px-3 py-1.5 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!ready}
            className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
          >
            Use image
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
