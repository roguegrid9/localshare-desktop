// useDraggable.ts - Custom hook for drag-and-drop functionality with snap-to-dock
import { useRef, useEffect, useState } from 'react';

const SNAP_THRESHOLD = 80; // px from bottom edge to trigger dock snap

interface UseDraggableProps {
  enabled?: boolean;
  position: { x: number; y: number };
  onDragEnd?: (x: number, y: number, shouldDock: boolean) => void;
  onDragMove?: (x: number, y: number) => void;
}

export function useDraggable({
  enabled = true,
  position,
  onDragEnd,
  onDragMove,
}: UseDraggableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    if (!enabled || !ref.current) return;

    const el = ref.current;

    const handlePointerDown = (e: PointerEvent) => {
      // Only allow dragging from specific drag handles or the header
      const target = e.target as HTMLElement;
      if (!target.closest('[data-drag-handle]')) return;

      dragStateRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: position.x,
        offsetY: position.y,
      };

      setIsDragging(true);
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStateRef.current.isDragging) return;

      const deltaX = e.clientX - dragStateRef.current.startX;
      const deltaY = e.clientY - dragStateRef.current.startY;

      const newX = dragStateRef.current.offsetX + deltaX;
      const newY = dragStateRef.current.offsetY + deltaY;

      // Constrain to viewport bounds
      const maxX = window.innerWidth - (el.offsetWidth || 300);
      const maxY = window.innerHeight - (el.offsetHeight || 60);

      const constrainedX = Math.max(0, Math.min(newX, maxX));
      const constrainedY = Math.max(0, Math.min(newY, maxY));

      // Apply transform for smooth dragging
      el.style.transform = `translate(${constrainedX}px, ${constrainedY}px)`;

      onDragMove?.(constrainedX, constrainedY);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!dragStateRef.current.isDragging) return;

      const deltaX = e.clientX - dragStateRef.current.startX;
      const deltaY = e.clientY - dragStateRef.current.startY;

      const newX = dragStateRef.current.offsetX + deltaX;
      const newY = dragStateRef.current.offsetY + deltaY;

      // Constrain to viewport bounds
      const maxX = window.innerWidth - (el.offsetWidth || 300);
      const maxY = window.innerHeight - (el.offsetHeight || 60);

      const finalX = Math.max(0, Math.min(newX, maxX));
      const finalY = Math.max(0, Math.min(newY, maxY));

      // Check if near bottom edge (should snap back to dock)
      const distanceFromBottom = window.innerHeight - (finalY + (el.offsetHeight || 60));
      const shouldDock = distanceFromBottom < SNAP_THRESHOLD;

      dragStateRef.current.isDragging = false;
      setIsDragging(false);
      el.releasePointerCapture(e.pointerId);

      // Reset transform to let React position handle it
      el.style.transform = '';

      onDragEnd?.(finalX, finalY, shouldDock);
    };

    el.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [enabled, position, onDragEnd, onDragMove]);

  return { ref, isDragging };
}
