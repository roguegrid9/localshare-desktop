import { motion, AnimatePresence } from 'framer-motion';
import { useToastContext, type Toast } from './ToastContext';
import { cn } from '../../utils/cx';

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToastContext();

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
      case 'error':
        return 'border-red-500/30 bg-red-500/10 text-red-300';
      case 'warning':
        return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
      case 'default':
      default:
        return 'border-border bg-bg-surface/95 text-text-primary';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'h-9 min-h-9 max-h-9 flex items-center px-4',
        'backdrop-blur-xl border shadow-lg rounded-lg text-sm',
        'pointer-events-auto',
        getToastStyles()
      )}
      onClick={() => removeToast(toast.id)}
    >
      {toast.message}
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastContext();

  return (
    <div
      className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pt-1.5 pointer-events-none z-50"
      style={{ width: 'max-content', maxWidth: '500px' }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
