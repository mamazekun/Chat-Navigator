import { ChatComposerElement, ChatSiteAdapter, QuestionItem } from '../utils/types';

const TITLE_MAX_LENGTH = 60;
const questionIds = new WeakMap<HTMLElement, string>();
let questionIdCounter = 0;

const chatGptUserSelectors = [
  '[data-message-author-role="user"]',
  '[data-testid="user-message"]',
];

const geminiUserSelectors = [
  'user-query',
  '[data-test-id="user-query"]',
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
  getComposerElement(doc: Document): ChatComposerElement | null {
    const selectorCandidates = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      '[data-testid="composer-text-input"]',
      'form textarea',
      'form [contenteditable="true"][role="textbox"]',
      'form [contenteditable="true"]',
    ];

    return findFirstVisibleElement(doc, selectorCandidates);
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

const geminiAdapter: ChatSiteAdapter = {
  name: 'gemini',
  matches(hostname: string): boolean {
    return hostname === 'gemini.google.com' || hostname === 'bard.google.com';
  },
  isUserMessageElement(element: Element): boolean {
    return geminiUserSelectors.some((selector) => element.matches(selector));
  },
  getChatContainer(doc: Document): HTMLElement | null {
    return doc.querySelector<HTMLElement>('main') ?? doc.body;
  },
  getComposerElement(doc: Document): ChatComposerElement | null {
    const selectorCandidates = [
      'rich-textarea [contenteditable="true"]',
      'message-input [contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'textarea[aria-label]',
      'textarea',
    ];

    return findFirstVisibleElement(doc, selectorCandidates);
  },
  getUserMessageElements(root: ParentNode): HTMLElement[] {
    const selectorCandidates = [
      'user-query',
      '[data-test-id="user-query"]',
      '[data-test-id="user-query-bubble"]',
      '.user-query-bubble-with-background',
      '.query-text',
      '[aria-label^="You said"]',
      '[aria-label^="You:"]',
    ];

    const matches = firstNonEmptyQuery(root, selectorCandidates);
    if (matches.length === 0) {
      return [];
    }

    return uniqueByReference(matches.map(normalizeGeminiMessageRoot));
  },
};

const adapters: ChatSiteAdapter[] = [chatGptAdapter, geminiAdapter];

function uniqueByReference(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((element, index, arr) => arr.indexOf(element) === index);
}

function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findFirstVisibleElement(
  root: ParentNode,
  selectors: string[],
): ChatComposerElement | null {
  for (const selector of selectors) {
    const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const visible = matches.find((element) => isVisibleElement(element));
    if (visible) {
      return visible;
    }
  }

  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildTitle(text: string, index: number): string {
  const collapsed = normalizeQuestionText(text);
  if (!collapsed) {
    return `Question ${index + 1}`;
  }

  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH)}...`
    : collapsed;
}

function isSpeechLabelLine(line: string): boolean {
  return /^(?:you\s*said|you|你说)\s*(?:[:：])?$/i.test(line.trim());
}

function normalizeQuestionText(text: string): string {
  const invisibleRemoved = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\r/g, '').trim();
  if (!invisibleRemoved) {
    return '';
  }

  const lines = invisibleRemoved
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length > 1 && isSpeechLabelLine(lines[0])) {
    lines.shift();
  }

  const collapsed = lines.join(' ').replace(/\s+/g, ' ').trim();
  return collapsed.replace(/^(?:you\s*said|you|你说)\s*(?:[:：]\s*)?/i, '').trim();
}

function normalizeComposerText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r/g, '')
    .trim();
}

function readGeminiContentEditableText(element: HTMLElement): string {
  const paragraphs = Array.from(element.querySelectorAll('p'));
  if (paragraphs.length === 0) {
    return element.innerText || element.textContent || '';
  }

  return paragraphs
    .map((paragraph) => {
      const text = paragraph.innerText || paragraph.textContent || '';
      return text === '\n' ? '' : text.replace(/\n/g, '');
    })
    .join('\n');
}

function getElementText(element: ChatComposerElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }

  if (getActiveAdapter()?.name === 'gemini' && element.classList.contains('ql-editor')) {
    return readGeminiContentEditableText(element);
  }

  return element.innerText || element.textContent || '';
}

function setNativeValue(
  element: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): void {
  const prototype = Object.getPrototypeOf(element) as HTMLTextAreaElement | HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }

  element.value = value;
}

function dispatchComposerEvents(element: ChatComposerElement): void {
  if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)) {
    element.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: null,
    }));
  }

  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertReplacementText',
    data: null,
  }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function replaceContentEditableText(element: HTMLElement, value: string): void {
  element.focus();
  element.replaceChildren();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let inserted = false;
  if (typeof document.execCommand === 'function') {
    try {
      inserted = document.execCommand('insertText', false, value);
    } catch {
      inserted = false;
    }
  }

  if (!inserted) {
    element.textContent = value;
  }

  if (!element.textContent?.trim() && value) {
    element.textContent = value;
  }

  const cursorRange = document.createRange();
  cursorRange.selectNodeContents(element);
  cursorRange.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(cursorRange);
}

function replaceGeminiContentEditableText(element: HTMLElement, value: string): void {
  element.focus();
  element.replaceChildren();
  element.classList.toggle('ql-blank', value.length === 0);

  const lines = value.split('\n');
  lines.forEach((line) => {
    const paragraph = document.createElement('p');
    if (line.length > 0) {
      paragraph.textContent = line;
    } else {
      paragraph.appendChild(document.createElement('br'));
    }
    element.appendChild(paragraph);
  });

  if (element.childNodes.length === 0) {
    const paragraph = document.createElement('p');
    paragraph.appendChild(document.createElement('br'));
    element.appendChild(paragraph);
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function extractGeminiBodyText(element: HTMLElement): string {
  const contentCandidates = [
    '[data-test-id="user-query-bubble"] .query-text',
    '[data-test-id="user-query-bubble"]',
    '.user-query-bubble-with-background .query-text',
    '.query-text',
    'message-content',
  ];

  for (const selector of contentCandidates) {
    const content = element.querySelector<HTMLElement>(selector);
    const text = content?.innerText || content?.textContent || '';
    if (normalizeQuestionText(text)) {
      return text;
    }
  }

  return element.innerText || element.textContent || '';
}

function extractGeminiAttachmentTexts(element: HTMLElement): string[] {
  const attachmentSelectors = [
    '[data-test-id*="attachment"]',
    '[data-test-id*="file"]',
    '[aria-label*="attachment"]',
    '[aria-label*="uploaded"]',
    '[aria-label*="附件"]',
    '[aria-label*="文件"]',
    'mat-chip',
  ];

  const seen = new Set<string>();
  const results: string[] = [];

  attachmentSelectors.forEach((selector) => {
    element.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      const raw = (node.innerText || node.textContent || '').trim();
      const text = normalizeQuestionText(raw);
      if (!text) {
        return;
      }

      const key = text.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      results.push(text);
    });
  });

  return results;
}

function extractQuestionText(element: HTMLElement): string {
  const adapter = getActiveAdapter();
  if (adapter?.name === 'gemini') {
    const bodyText = normalizeQuestionText(extractGeminiBodyText(element));
    const attachmentTexts = extractGeminiAttachmentTexts(element);

    if (attachmentTexts.length === 0) {
      return bodyText;
    }

    if (!bodyText) {
      return attachmentTexts.join(' ');
    }

    const missingAttachments = attachmentTexts.filter((attachment) =>
      !bodyText.toLowerCase().includes(attachment.toLowerCase()),
    );

    if (missingAttachments.length === 0) {
      return bodyText;
    }

    return `${missingAttachments.join(' ')} ${bodyText}`.trim();
  }

  return element.innerText || element.textContent || '';
}

function firstNonEmptyQuery(root: ParentNode, selectors: string[]): HTMLElement[] {
  for (const selector of selectors) {
    const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (matches.length > 0) {
      return matches;
    }
  }

  return [];
}

function normalizeGeminiMessageRoot(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>('user-query, [data-test-id="user-query"]') ?? element;
}

function resolveAdapter(hostname: string): ChatSiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(hostname)) ?? null;
}

function getActiveAdapter(): ChatSiteAdapter | null {
  return resolveAdapter(window.location.hostname);
}

function ensureElementId(element: HTMLElement, index: number, title: string): string {
  const existingId = questionIds.get(element);
  if (existingId) {
    return existingId;
  }

  questionIdCounter += 1;
  const generatedId = `mzk-question-${questionIdCounter}-${index + 1}-${slugify(title).slice(0, 24)}`;
  questionIds.set(element, generatedId);
  return generatedId;
}

export function findClosestUserMessageElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  const adapter = getActiveAdapter();
  if (!adapter) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : (node.parentElement as Element | null);

  if (!element) {
    return null;
  }

  if (adapter.isUserMessageElement(element)) {
    return element as HTMLElement;
  }

  let current = element.parentElement;
  while (current) {
    if (adapter.isUserMessageElement(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
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
  const text = normalizeQuestionText(extractQuestionText(element));
  const title = buildTitle(text, index);
  const id = ensureElementId(element, index, title);

  return {
    id,
    title,
    text,
    element,
    index,
  };
}

export function buildQuestionItemsFromElements(elements: HTMLElement[]): QuestionItem[] {
  return elements.map((element, index) => toQuestionItem(element, index));
}

export function getCurrentComposerElement(doc: Document = document): ChatComposerElement | null {
  const adapter = getActiveAdapter();
  if (!adapter) {
    return null;
  }

  return adapter.getComposerElement?.(doc) ?? null;
}

export function getComposerText(doc: Document = document): string {
  const composer = getCurrentComposerElement(doc);
  if (!composer) {
    return '';
  }

  return normalizeComposerText(getElementText(composer));
}

export function setComposerText(value: string, doc: Document = document): boolean {
  const composer = getCurrentComposerElement(doc);
  const adapter = getActiveAdapter();
  if (!composer) {
    return false;
  }

  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    composer.focus();
    setNativeValue(composer, value);
    composer.setSelectionRange(value.length, value.length);
  } else {
    if (adapter?.name === 'gemini') {
      replaceGeminiContentEditableText(composer, value);
    } else {
      replaceContentEditableText(composer, value);
    }
  }

  dispatchComposerEvents(composer);
  composer.focus();
  return true;
}
