"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Synapse PWA Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("Synapse Service Worker registration failed:", err);
        });
    }
  }, []);

  return null;
}
