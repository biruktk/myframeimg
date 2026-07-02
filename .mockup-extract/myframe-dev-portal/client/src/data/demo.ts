import type { DemoStep } from "../types";

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "demo-login",
    title: "Step 1: Authenticate",
    description:
      "Obtain an API token by authenticating with your credentials. All subsequent API calls use this token in the Authorization header.",
    apis: ["mf_1"],
  },
  {
    id: "demo-get-frames",
    title: "Step 2: Get Frame Status",
    description:
      "Retrieve the list of frames associated with your account. Each frame has a unique ID that you'll use in subsequent steps. Check the status to ensure the frame is online.",
    apis: ["mf_1"],
  },
  {
    id: "demo-upload",
    title: "Step 3: Upload a Photo",
    description:
      "Send a photo to a specific frame. The image is automatically optimized for the E Ink display. You can provide a public URL or upload the file directly. Add a caption to personalize the photo.",
    apis: ["mf_3"],
  },
  {
    id: "demo-verify",
    title: "Step 4: Verify Upload",
    description:
      "Check the photo list on the frame to confirm the upload succeeded. The frame typically displays new photos within 30 seconds of receiving them.",
    apis: ["mf_4"],
  },
  {
    id: "demo-remote",
    title: "Step 5: Remote Control",
    description:
      "Trigger a remote operation on the frame such as firmware update or display refresh. The frame will acknowledge the command and execute it during its next maintenance window.",
    apis: ["mf_10", "mf_7"],
  },
];
