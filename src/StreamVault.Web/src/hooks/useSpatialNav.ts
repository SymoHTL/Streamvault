import { useEffect, useCallback } from 'react';

/**
 * Lightweight spatial navigation for TV remotes / D-pad.
 * Moves focus between focusable elements using arrow keys within a container.
 * 
 * Usage: call useSpatialNav() in your page/layout component.
 * All standard focusable elements (button, a, input, select, [tabindex]) are navigable.
 * 
 * Behavior:
 * - ArrowUp/Down: move focus vertically between elements
 * - ArrowLeft/Right: move focus horizontally (within rows)
 * - Enter: activate focused element
 * - When inside a scrollable row, left/right scrolls the row and moves focus
 */

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    el => el.offsetParent !== null && !el.closest('[data-controls]') // visible, not in player controls
  );
}

function getRect(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, el };
}

type Direction = 'up' | 'down' | 'left' | 'right';

function findBestCandidate(current: HTMLElement, direction: Direction, candidates: HTMLElement[]): HTMLElement | null {
  const from = getRect(current);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const to = getRect(el);

    // Filter by direction
    switch (direction) {
      case 'up':
        if (to.y >= from.y - 5) continue;
        break;
      case 'down':
        if (to.y <= from.y + 5) continue;
        break;
      case 'left':
        if (to.x >= from.x - 5) continue;
        break;
      case 'right':
        if (to.x <= from.x + 5) continue;
        break;
    }

    // Score: prefer elements aligned on the cross-axis, then closest
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const mainDist = direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx);
    const crossDist = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = mainDist + crossDist * 3; // heavily penalize cross-axis distance

    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

export function useSpatialNav(containerRef?: React.RefObject<HTMLElement | null>) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle navigation when not in an input/textarea
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Don't interfere with player page (it has its own key handling)
    if (document.querySelector('.fixed.inset-0.bg-black.z-50')) return;

    let direction: Direction | null = null;
    switch (e.key) {
      case 'ArrowUp': direction = 'up'; break;
      case 'ArrowDown': direction = 'down'; break;
      case 'ArrowLeft': direction = 'left'; break;
      case 'ArrowRight': direction = 'right'; break;
      case 'Enter': {
        const active = document.activeElement as HTMLElement;
        if (active && active !== document.body) {
          active.click();
          e.preventDefault();
        }
        return;
      }
      default: return;
    }

    e.preventDefault();
    const container = containerRef?.current ?? document.body;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const active = document.activeElement as HTMLElement;
    if (!active || active === document.body || !container.contains(active)) {
      // Nothing focused — focus first element
      focusable[0].focus({ preventScroll: false });
      focusable[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }

    const next = findBestCandidate(active, direction, focusable);
    if (next) {
      next.focus({ preventScroll: false });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
