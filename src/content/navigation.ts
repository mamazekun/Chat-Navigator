import { QuestionItem } from '../utils/types';

export class QuestionNavigator {
  private allItems: QuestionItem[] = [];
  private activeId: string | null = null;

  setItems(items: QuestionItem[]): void {
    this.allItems = items;
  }

  getItems(): QuestionItem[] {
    return this.allItems;
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  jumpToId(id: string): void {
    const item = this.allItems.find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.activeId = id;
  }

  syncActiveByViewport(viewportOffsetRatio = 0.35): string | null {
    const items = this.allItems;
    if (items.length === 0) {
      this.activeId = null;
      return null;
    }

    const threshold = window.innerHeight * viewportOffsetRatio;
    let candidate: QuestionItem | null = null;

    for (const item of items) {
      const top = item.element.getBoundingClientRect().top;
      if (top <= threshold) {
        candidate = item;
      } else if (!candidate) {
        candidate = item;
      } else {
        break;
      }
    }

    this.activeId = candidate?.id ?? null;
    return this.activeId;
  }
}
