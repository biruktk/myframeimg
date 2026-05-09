"use client";

import { useEffect } from "react";

export default function LocaleBlogBridge() {
  useEffect(() => {
    window.location.replace("/blog.html");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-gray-600">
      Loading blog…
    </main>
  );
}
