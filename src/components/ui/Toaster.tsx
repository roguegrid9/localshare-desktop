import 
 { createContext, useCallback, useContext, useState } from "react";

type Toast = {
  id: string;
  message: string;
  type?: "info" | "success" | "error";
};

type ToastContextType = {
  addToast: (msg: string, type?: Toast["type"]) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "rounded-xl border px-4 py-2 text-sm shadow-lg max-w-sm",
              "animate-slide-in",
              t.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : t.type === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-white/10 bg-[#111319] text-white/80",
            ].join(" ")}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToasterProvider>");
  return ctx.addToast;
}
