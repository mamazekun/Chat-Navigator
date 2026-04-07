export interface QuestionItem {
  id: string;
  title: string;
  element: HTMLElement;
  index: number;
}

export interface ChatSiteAdapter {
  name: string;
  matches(hostname: string): boolean;
  isUserMessageElement(element: Element): boolean;
  getUserMessageElements(root: ParentNode): HTMLElement[];
  getChatContainer?(doc: Document): HTMLElement | null;
}
