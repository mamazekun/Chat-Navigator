export interface QuestionItem {
  id: string;
  title: string;
  text: string;
  element: HTMLElement;
  index: number;
}

export type ChatComposerElement = HTMLElement | HTMLTextAreaElement | HTMLInputElement;

export interface ChatSiteAdapter {
  name: string;
  matches(hostname: string): boolean;
  isUserMessageElement(element: Element): boolean;
  getUserMessageElements(root: ParentNode): HTMLElement[];
  getChatContainer?(doc: Document): HTMLElement | null;
  getComposerElement?(doc: Document): ChatComposerElement | null;
}
