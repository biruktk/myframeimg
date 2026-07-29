type MenuLike = { label: string; url: string };

const APPLICATION_URLS = new Set([
  "download",
  "download-app",
  "page/download-app",
  "/page/download-app",
]);

/** Download / Application entries are hidden from the top marketing nav. */
export function isApplicationMenuItem(item: MenuLike): boolean {
  return APPLICATION_URLS.has(item.url) || /application/i.test(item.label);
}

export function filterMarketingMenus<T extends MenuLike>(menus: T[]): T[] {
  return menus.filter((item) => !isApplicationMenuItem(item));
}
