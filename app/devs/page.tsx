import type { Metadata } from "next";

import { DevPortal } from "@/components/devs/dev-portal";

import "./devs.css";

export const metadata: Metadata = {
  title: "MyFrame Dev Portal",
  robots: { index: false, follow: false },
};

export default function DevsPage() {
  return <DevPortal />;
}
