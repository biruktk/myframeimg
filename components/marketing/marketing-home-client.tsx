"use client";

import Script from "next/script";

/** Client shell for static marketing HTML so the server page does not mix RSC + inline Script bodies. */
export function MarketingHomeClient({ markupHtml }: { markupHtml: string }) {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: markupHtml }} suppressHydrationWarning />
      <Script src="/site-runtime.js" strategy="afterInteractive" />
      <Script src="/marketing-widgets.js" strategy="afterInteractive" />
    </>
  );
}
