import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { X, Download, AlertCircle, CheckCircle } from "lucide-react";

type UpdateNotification = {
  id: string;
  type: "update-available" | "update-installed" | "update-error" | "update-downloading";
  version?: string;
  currentVersion?: string;
  error?: string;
  progress?: number;
};

export function UpdateNotification() {
  const [notifications, setNotifications] = useState<UpdateNotification[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        // Listen for update available
        const unlisten1 = await listen<{ version: string; current_version: string }>(
          "update-available",
          (event) => {
            const id = Math.random().toString(36).slice(2);
            const notification: UpdateNotification = {
              id,
              type: "update-available",
              version: event.payload.version,
              currentVersion: event.payload.current_version,
            };
            setNotifications((prev) => [...prev, notification]);

            // Auto-dismiss after 10 seconds
            setTimeout(() => {
              setNotifications((prev) => prev.filter((n) => n.id !== id));
            }, 10000);
          }
        );
        unlisteners.push(unlisten1);

        // Listen for update installed
        const unlisten2 = await listen("update-installed", () => {
          const id = Math.random().toString(36).slice(2);
          const notification: UpdateNotification = {
            id,
            type: "update-installed",
          };
          setNotifications((prev) => [...prev, notification]);
          // No auto-dismiss for restart required notification
        });
        unlisteners.push(unlisten2);

        // Listen for update errors
        const unlisten3 = await listen<{ error: string }>("update-error", (event) => {
          const id = Math.random().toString(36).slice(2);
          const notification: UpdateNotification = {
            id,
            type: "update-error",
            error: event.payload.error,
          };
          setNotifications((prev) => [...prev, notification]);
          setDownloading(false);

          // Auto-dismiss after 10 seconds
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
          }, 10000);
        });
        unlisteners.push(unlisten3);

        // Listen for download progress
        const unlisten4 = await listen<{ progress: number; downloaded: number; total: number }>(
          "update-download-progress",
          (event) => {
            setNotifications((prev) =>
              prev.map((n) =>
                n.type === "update-downloading"
                  ? { ...n, progress: event.payload.progress }
                  : n
              )
            );
          }
        );
        unlisteners.push(unlisten4);

        // Listen for installing state
        const unlisten5 = await listen("update-installing", () => {
          setNotifications((prev) =>
            prev.map((n) =>
              n.type === "update-downloading" ? { ...n, progress: 100 } : n
            )
          );
        });
        unlisteners.push(unlisten5);
      } catch (error) {
        // Silently fail in dev mode or if events aren't available
        console.debug("Update notification listeners not available:", error);
      }
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handleDismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (error) {
      console.error("Failed to relaunch:", error);
    }
  };

  const handleDownloadUpdate = async (notificationId: string) => {
    try {
      setDownloading(true);

      // Replace update-available notification with downloading notification
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, type: "update-downloading", progress: 0 }
            : n
        )
      );

      await invoke("download_and_install_update");
    } catch (error) {
      console.error("Failed to download update:", error);
      setDownloading(false);

      // Show error notification
      const id = Math.random().toString(36).slice(2);
      const notification: UpdateNotification = {
        id,
        type: "update-error",
        error: error instanceof Error ? error.message : String(error),
      };
      setNotifications((prev) => [...prev, notification]);

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 10000);
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[2001] flex flex-col gap-2 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={[
            "rounded-xl border px-4 py-3 shadow-lg max-w-sm pointer-events-auto",
            "animate-slide-in flex items-start gap-3",
            notification.type === "update-available"
              ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
              : notification.type === "update-downloading"
              ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
              : notification.type === "update-installed"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300",
          ].join(" ")}
        >
          <div className="flex-shrink-0 mt-0.5">
            {notification.type === "update-available" && (
              <Download className="w-4 h-4" />
            )}
            {notification.type === "update-downloading" && (
              <Download className="w-4 h-4 animate-pulse" />
            )}
            {notification.type === "update-installed" && (
              <CheckCircle className="w-4 h-4" />
            )}
            {notification.type === "update-error" && (
              <AlertCircle className="w-4 h-4" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {notification.type === "update-available" && (
              <div>
                <p className="text-sm font-medium">Update Available</p>
                <p className="text-xs opacity-80 mt-0.5 mb-2">
                  Version {notification.version} is available (current: {notification.currentVersion})
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadUpdate(notification.id)}
                    disabled={downloading}
                    className="text-xs px-3 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    Download Now
                  </button>
                  <button
                    onClick={() => handleDismiss(notification.id)}
                    className="text-xs px-3 py-1 rounded-lg bg-transparent hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
                  >
                    Remind Me Later
                  </button>
                </div>
              </div>
            )}
            {notification.type === "update-downloading" && (
              <div>
                <p className="text-sm font-medium">
                  {notification.progress === 100 ? "Installing Update..." : "Downloading Update..."}
                </p>
                <div className="mt-2 mb-1 bg-blue-500/20 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300"
                    style={{ width: `${notification.progress || 0}%` }}
                  />
                </div>
                <p className="text-xs opacity-80">{notification.progress || 0}% complete</p>
              </div>
            )}
            {notification.type === "update-installed" && (
              <div>
                <p className="text-sm font-medium">Update Installed</p>
                <p className="text-xs opacity-80 mt-0.5 mb-2">
                  Restart to apply the update
                </p>
                <button
                  onClick={handleRestart}
                  className="text-xs px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                >
                  Restart Now
                </button>
              </div>
            )}
            {notification.type === "update-error" && (
              <div>
                <p className="text-sm font-medium">Update Error</p>
                <p className="text-xs opacity-80 mt-0.5">{notification.error}</p>
              </div>
            )}
          </div>

          {notification.type !== "update-downloading" && (
            <button
              onClick={() => handleDismiss(notification.id)}
              className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
