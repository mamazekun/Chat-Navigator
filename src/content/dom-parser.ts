import { ChatSiteAdapter, QuestionItem } from '../utils/types';

const TITLE_MAX_LENGTH = 60;

const chatGptUserSelectors = [
  '[data-message-author-role="user"]',
  '[data-testid="user-message"]',
];

// ChatGPT-first adapter. Keep selectors grouped for easy future site expansion.
const chatGptAdapter: ChatSiteAdapter = {
  name: 'chatgpt',
  matches(hostname: string): boolean {
    return hostname === 'chatgpt.com' || hostname === 'chat.openai.com';
  },
  isUserMessageElement(element: Element): boolean {
    return chatGptUserSelectors.some((selector) => element.matches(selector));
  },
  getChatContainer(doc: Document): HTMLElement | null {
    return doc.querySelector<HTMLElement>('main') ?? doc.body;
  },
  getUserMessageElements(root: ParentNode): HTMLElement[] {
    const selectorCandidates = [
      '[data-message-author-role="user"]',
      'article [data-message-author-role="user"]',
      'article div[data-message-author-role="user"]',
      '[data-testid="user-message"]',
      'main [data-testid="user-message"]',
    ];

    const buckets = selectorCandidates
      .map((selector) => Array.from(root.querySelectorAll<HTMLElement>(selector)))
      .filter((matches) => matches.length > 0);

    if (buckets.length > 0) {
      return uniqueByReference(buckets.flat());
    }

    const fallback = Array.from(root.querySelectorAll<HTMLElement>('article'))
      .map((article) => article.querySelector<HTMLElement>('div.whitespace-pre-wrap, div.prose, p'))
      .filter((node): node is HTMLElement => Boolean(node));

    return uniqueByReference(fallback);
  },
};

const adapters: ChatSiteAdapter[] = [chatGptAdapter];

function uniqueByReference(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((element, index, arr) => arr.indexOf(element) === index);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildTitle(text: string, index: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return `Question ${index + 1}`;
  }

  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH)}...`
    : collapsed;
}

function resolveAdapter(hostname: string): ChatSiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(hostname)) ?? null;
}

function getActiveAdapter(): ChatSiteAdapter | null {
  return resolveAdapter(window.location.hostname);
}

function ensureElementId(element: HTMLElement, index: number, title: string): string {
  if (element.id) {
    return element.id;
  }

  const generatedId = `mzk-question-${index + 1}-${slugify(title).slice(0, 24)}`;
  element.id = generatedId;
  return generatedId;
}

export function isUserMessageElement(element: Element): boolean {
  const adapter = getActiveAdapter();
  if (!adapter) {
    return false;
  }

  return adapter.isUserMessageElement(element);
}

export function findClosestUserMessageElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : (node.parentElement as Element | null);

  if (!element) {
    return null;
  }

  if (isUserMessageElement(element)) {
    return element as HTMLElement;
  }

  return element.closest<HTMLElement>(chatGptUserSelectors.join(','));
}

export function getChatContainer(doc: Document = document): HTMLElement {
  const adapter = getActiveAdapter();
  if (!adapter) {
    return doc.body;
  }

  return adapter.getChatContainer?.(doc) ?? doc.body;
}

export function getUserMessageElements(root: ParentNode = document): HTMLElement[] {
  const adapter = getActiveAdapter();
  if (!adapter) {
    return [];
  }

  return adapter.getUserMessageElements(root);
}

export function toQuestionItem(element: HTMLElement, index: number): QuestionItem {
  const text = element.innerText || element.textContent || '';
  const title = buildTitle(text, index);
  const id = ensureElementId(element, index, title);

  return {
    id,
    title,
    element,
    index,
  };
}

export function buildQuestionItemsFromElements(elements: HTMLElement[]): QuestionItem[] {
  return elements.map((element, index) => toQuestionItem(element, index));
}

export function extractQuestions(doc: Document = document): QuestionItem[] {
  return buildQuestionItemsFromElements(getUserMessageElements(doc));
}
