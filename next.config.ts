import type { NextConfig } from "next";

const localePattern = "en|zh|es|fr|de|ja";

const apiUpstream = (process.env.MYFRAME_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/mobile/google-signin", destination: `${apiUpstream}/mobile/google-signin` },
      { source: "/mobile/google-auth", destination: `${apiUpstream}/mobile/google-auth` },
    ];
  },
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
