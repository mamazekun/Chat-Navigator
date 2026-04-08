import {
  buildQuestionItemsFromElements,
  findClosestUserMessageElement,
  getComposerText,
  getChatContainer,
  getUserMessageElements,
  setComposerText,
  toQuestionItem,
} from './dom-parser';
import { QuestionNavigator } from './navigation';
import { QuestionPanel } from './panel';
import { QuestionItem } from '../utils/types';

const navigator = new QuestionNavigator();
const questionsByElement = new Map<HTMLElement, QuestionItem>();

let observer: MutationObserver | null = null;
let observedRoot: HTMLElement | null = null;
let scrollRafPending = false;
let pendingMutations: MutationRecord[] = [];

function compareDomOrder(a: HTMLElement, b: HTMLElement): number {
  if (a === b) {
    return 0;
  }

  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }

  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }

  return 0;
}

function syncNavigatorFromMap(): void {
  const orderedElements = Array.from(questionsByElement.keys())
    .filter((element) => element.isConnected)
    .sort(compareDomOrder);

  const items = orderedElements.map((element, index) => {
    const existing = questionsByElement.get(element);
    if (!existing) {
      return toQuestionItem(element, index);
    }

    return {
      ...existing,
      index,
    };
  });

  questionsByElement.clear();
  items.forEach((item) => {
    questionsByElement.set(item.element, item);
  });

  navigator.setItems(items);
}

function render(): void {
  panel.render(navigator.getItems(), navigator.getActiveId());
}

function fullRefreshQuestions(): void {
  const allElements = getUserMessageElements(document);
  const allItems = buildQuestionItemsFromElements(allElements);

  questionsByElement.clear();
  allItems.forEach((item) => {
    questionsByElement.set(item.element, item);
  });

  navigator.setItems(allItems);
  navigator.syncActiveByViewport();
  render();
}

function collectUserElementsFromNode(node: Node, collection: Set<HTMLElement>): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const closest = findClosestUserMessageElement(node);
    if (closest) {
      collection.add(closest);
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const navShell = document.getElementById('mzk-question-nav-shell');
  if (navShell && (element === navShell || navShell.contains(element))) {
    return;
  }

  const closest = findClosestUserMessageElement(element);
  if (closest) {
    collection.add(closest);
  }

  getUserMessageElements(element).forEach((messageElement) => {
    collection.add(messageElement);
  });
}

function incrementalRefreshFromMutations(mutations: MutationRecord[]): void {
  const touchedElements = new Set<HTMLElement>();
  let needsStructuralReconcile = false;

  mutations.forEach((mutation) => {
    if (mutation.type === 'characterData') {
      const closest = findClosestUserMessageElement(mutation.target);
      if (closest) {
        touchedElements.add(closest);
      }
      return;
    }

    if (mutation.type === 'childList') {
      if (mutation.removedNodes.length > 0) {
        needsStructuralReconcile = true;
      }

      collectUserElementsFromNode(mutation.target, touchedElements);
      mutation.addedNodes.forEach((node) => collectUserElementsFromNode(node, touchedElements));
    }
  });

  if (needsStructuralReconcile) {
    fullRefreshQuestions();
    return;
  }

  if (touchedElements.size === 0) {
    return;
  }

  touchedElements.forEach((element) => {
    if (!element.isConnected) {
      questionsByElement.delete(element);
      return;
    }

    const previous = questionsByElement.get(element);
    const next = toQuestionItem(element, previous?.index ?? 0);
    questionsByElement.set(element, next);
  });

  syncNavigatorFromMap();
  navigator.syncActiveByViewport();
  render();
}

function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timer: number | null = null;

  return (...args: Parameters<T>) => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }

    timer = window.setTimeout(() => {
      fn(...args);
      timer = null;
    }, wait);
  };
}

const debouncedProcessMutations = debounce(() => {
  const batch = pendingMutations;
  pendingMutations = [];
  incrementalRefreshFromMutations(batch);
}, 180);

function ensureObserverRoot(): void {
  const root = getChatContainer(document);
  if (observedRoot === root && observer) {
    return;
  }

  observer?.disconnect();
  observedRoot = root;
  observer = new MutationObserver((mutations) => {
    pendingMutations.push(...mutations);
    debouncedProcessMutations();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function buildFollowUpPrompt(historyQuestion: string, currentQuestion: string): string {
  return `回到刚才的问题：
${historyQuestion}

在这个基础上，我想进一步追问：
${currentQuestion}`.trimEnd();
}

const panel = new QuestionPanel({
  onSelect: (id) => {
    navigator.jumpToId(id);
    render();
  },
  onFollowUp: (id) => {
    const items = navigator.getItems();
    const targetItem = items.find((item) => item.id === id);
    if (!targetItem) {
      return;
    }

    const isLatestQuestion = items[items.length - 1]?.id === id;
    const currentQuestion = getComposerText();
    const nextValue = isLatestQuestion
      ? currentQuestion
      : buildFollowUpPrompt(targetItem.text || targetItem.title, currentQuestion);

    setComposerText(nextValue);
  },
});

function onScroll(): void {
  if (scrollRafPending) {
    return;
  }

  scrollRafPending = true;
  requestAnimationFrame(() => {
    scrollRafPending = false;
    navigator.syncActiveByViewport();
    render();
  });
}

function init(): void {
  ensureObserverRoot();
  fullRefreshQuestions();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Chat apps often swap the conversation root during in-app navigation.
  window.setInterval(() => {
    ensureObserverRoot();
  }, 2000);
}

init();
