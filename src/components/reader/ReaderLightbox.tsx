"use client";

import React from "react";
import { ExternalLink, X } from "lucide-react";

export interface LightboxImage {
  src: string;
  alt?: string;
}

export interface ReaderLightboxProps {
  image: LightboxImage | null;
  onClose: () => void;
}

export function ReaderLightbox({ image, onClose }: ReaderLightboxProps) {
  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in cursor-zoom-out"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl max-h-[90vh] flex flex-col items-center cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={image.src}
          alt={image.alt}
          className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-800"
        />
        <div className="mt-3.5 flex items-center gap-4 bg-slate-900/90 px-4 py-2 rounded-full border border-slate-700/80 text-xs text-slate-300 shadow-xl">
          <span className="truncate max-w-xs font-medium">{image.alt || "Image"}</span>
          <a
            href={image.src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-semibold transition-colors"
          >
            <span>Full Resolution</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
            aria-label="Close image preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
