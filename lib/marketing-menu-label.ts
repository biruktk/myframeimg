export function translateMarketingMenuLabel(
  item: { label: string; url: string },
  translated: Record<string, string>,
): string {
  if (/cart/i.test(item.label) || /cart-checkout/i.test(item.url)) {
    return translated.menuCart ?? item.label;
  }
  if (item.url === "#features") return translated.menuFeatures ?? item.label;
  if (item.url === "#product") return translated.menuProduct ?? item.label;
  if (item.url === "#pricing") return translated.menuPricing ?? item.label;
  if (item.url === "#family") return translated.menuFamilies ?? item.label;
  if (["download", "download-app", "page/download-app", "/page/download-app"].includes(item.url)) {
    return translated.menuApplication ?? translated.footerDownloadApp ?? item.label;
  }
  return item.label;
}
