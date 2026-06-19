import type { Metadata } from "next";

import { DevsLogConsole } from "@/components/devs/devs-log-console";

import "./devs.css";

export const metadata: Metadata = {
  title: "MyFrame Devs — Frame Logs",
  robots: { index: false, follow: false },
};

export default function DevsPage() {
  return <DevsLogConsole />;
}
