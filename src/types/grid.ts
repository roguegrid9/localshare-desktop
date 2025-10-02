export type GridStatus = "online" | "idle"; // per spec: grids won't be offline

export interface GridSummary {
  id: string;
  name: string;
  icon?: React.ReactNode; // optional: supply a lucide icon
  status: GridStatus;
  memberCount?: number;
  unread?: number;
  metadata?: { grid_type?: string; [key: string]: any }; // Added metadata support
}

export type Process = {
  id: string;
  name: string;
  owner: string;
  type: "terminal" | "web" | "game";
  port?: number;
  status: "running" | "starting" | "stopped";
  cpu?: number;
  mem?: number;
};

export type Channel = {
  id: string;
  type: "text" | "voice" | "video";
  name: string;
  unread?: number;
};

export type Member = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  online: boolean;
};