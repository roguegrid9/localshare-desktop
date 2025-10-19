// bubbleStorage.ts - Persistence for bubble layouts
import type { ChatBubble } from '../stores/useUIStore';

const BUBBLE_LAYOUT_KEY = 'roguegrid9_bubble_layout';

export interface PersistedBubbleLayout {
  id: string;
  docked: boolean;
  position?: { x: number; y: number };
  expanded: boolean;
}

export function saveBubbleLayout(bubbles: ChatBubble[]): void {
  try {
    const layout: PersistedBubbleLayout[] = bubbles.map((b) => ({
      id: b.id,
      docked: b.docked,
      position: b.position,
      expanded: b.expanded,
    }));

    localStorage.setItem(BUBBLE_LAYOUT_KEY, JSON.stringify(layout));
  } catch (error) {
    console.error('Failed to save bubble layout:', error);
  }
}

export function loadBubbleLayout(): PersistedBubbleLayout[] | null {
  try {
    const stored = localStorage.getItem(BUBBLE_LAYOUT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to load bubble layout:', error);
    return null;
  }
}

export function clearBubbleLayout(): void {
  try {
    localStorage.removeItem(BUBBLE_LAYOUT_KEY);
  } catch (error) {
    console.error('Failed to clear bubble layout:', error);
  }
}
