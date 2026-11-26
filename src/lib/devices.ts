/** Device types an engineer can add. `sheet` is the Excel sub-sheet name (≤31 chars). */
export const DEVICE_TYPES = [
  { key: "water_level", label: "Water Level", sheet: "Water Level", hint: "Tank / reservoir level sensor", color: "#007AFF" },
  { key: "retrofit", label: "Retrofit", sheet: "Retrofit", hint: "Retrofit meter / controller kit", color: "#5856D6" },
  { key: "borewell", label: "Borewell", sheet: "Borewell", hint: "Borewell depth / yield monitor", color: "#A2845E" },
  { key: "current", label: "Current Sensor", sheet: "Current Sensor", hint: "Pump / motor current (CT) sensor", color: "#FF9500" },
  { key: "rain_gauge", label: "Rain Gauge", sheet: "Rain Gauge", hint: "Tipping-bucket rainfall gauge", color: "#32ADE6" },
  { key: "tds", label: "TDS", sheet: "TDS", hint: "Total dissolved solids probe", color: "#30B0C7" },
  { key: "flow", label: "Flow Meter", sheet: "Flow Meter", hint: "Pipeline flow / totaliser", color: "#34C759" },
  { key: "ph", label: "pH Sensor", sheet: "pH Sensor", hint: "Water quality pH probe", color: "#AF52DE" },
  { key: "pressure", label: "Pressure Sensor", sheet: "Pressure Sensor", hint: "Line pressure transducer", color: "#FF2D55" },
  { key: "other", label: "Other", sheet: "Other Devices", hint: "Any other field device", color: "#8E8E93" },
] as const;

export type DeviceTypeKey = (typeof DEVICE_TYPES)[number]["key"];

export const deviceType = (key: string) => DEVICE_TYPES.find((t) => t.key === key) ?? DEVICE_TYPES[DEVICE_TYPES.length - 1];

export const DEADLINE_MIN = 17 * 60; // 5:00 PM IST

// ---- Shared API shapes ----
export type Role = "admin" | "engineer";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  provider: "password" | "google";
  picture?: string;
  onboarded: boolean;
  createdAt: string;
  /** Engineers: the device types they chose at onboarding. They can only add/check these. */
  deviceTypes?: DeviceTypeKey[];
}

export interface Device {
  id: string;
  type: DeviceTypeKey;
  name: string;
  location: string;
  engineerId: string;
  active: boolean;
  createdAt: string;
  /** GPS position (parsed from the location text when it contains coordinates). */
  lat?: number;
  lng?: number;
}

/** Reasons an engineer can pick when a node is not sending data. */
export const OFFLINE_REASONS = [
  "Power failure",
  "Battery drained",
  "Solar panel issue",
  "Network / SIM issue",
  "Sensor fault",
  "Device damaged",
  "Under maintenance",
  "Site not accessible",
  "Unknown",
  "Other",
] as const;

export interface Answers {
  /** Is data coming from the node today? */
  dataStatus: "Online" | "Offline";
  lastDataReceived: string; // ISO
  offlineReason: string; // "" when online
  /** Derived: Online → Healthy, Offline → Issue Detected. */
  condition: "Healthy" | "Issue Detected";
}

export interface Inspection {
  id: string;
  deviceId: string;
  engineerId: string;
  date: string; // yyyy-mm-dd IST
  submittedAt: string; // ISO
  answers: Answers;
  remarks: string;
  issueDescription: string;
  late: boolean;
}
