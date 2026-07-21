export type DeviceStatusPayload = {
  connected: boolean;
  deviceId: string;
  deviceName?: string;
  room?: string;
  lastPhotoHours?: number;
  storageGb: number;
  photoCount: number;
  uptimeDays: number;
  transport?: { wifi: boolean; bluetooth: boolean };
};
