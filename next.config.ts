import type { NextConfig } from "next";

const localePattern = "en|zh|es|fr|de|ja";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Component name is not a route — send users to the real portal shell.
      {
        source: `/:locale(${localePattern})/PortalDashboardView`,
        destination: "/:locale/app/home",
        permanent: false,
      },
      {
        source: "/PortalDashboardView",
        destination: "/en/app/home",
        permanent: false,
      },
      {
        source: `/:locale(${localePattern})/portal`,
        destination: "/:locale/app/home",
        permanent: false,
      },
      {
        source: `/:locale(${localePattern})/dashboard`,
        destination: "/:locale/app/home",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
