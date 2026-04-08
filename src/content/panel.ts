import { QuestionItem } from '../utils/types';

interface PanelCallbacks {
  onSelect: (id: string) => void;
  onFollowUp: (id: string) => void;
}

type PanelVisibilityState = 'hidden' | 'collapsed' | 'expanded' | 'closing';

const SHELL_ROOT_ID = 'mzk-question-nav-shell';
const COLLAPSE_DELAY_MS = 380;
const MAX_VISIBLE_ITEMS = 7;

export class QuestionPanel {
  private shell: HTMLElement;
  private panel: HTMLElement;
  private trigger: HTMLElement;
  private list: HTMLElement;
  private searchInput: HTMLInputElement;
  private callbacks: PanelCallbacks;

  private state: PanelVisibilityState = 'hidden';
  private collapseTimer: number | null = null;
  private isOverTrigger = false;
  private isOverPanel = false;
  private isSearchFocused = false;

  private searchKeyword = '';
  private allQuestions: QuestionItem[] = [];
  private filteredQuestions: QuestionItem[] = [];

  constructor(callbacks: PanelCallbacks) {
    this.callbacks = callbacks;
    this.shell = this.createShell();
    this.panel = this.shell.querySelector<HTMLElement>('.mzk-question-nav__panel') as HTMLElement;
    this.trigger = this.shell.querySelector<HTMLElement>('.mzk-question-nav__trigger') as HTMLElement;
    this.list = this.shell.querySelector<HTMLElement>('.mzk-question-nav__list') as HTMLElement;
    this.searchInput = this.shell.querySelector<HTMLInputElement>('.mzk-question-nav__search') as HTMLInputElement;

    this.bindHoverEvents();
    this.bindSearchEvents();
    this.bindListEvents();
    this.applyState();
  }

  private createShell(): HTMLElement {
    let shell = document.getElementById(SHELL_ROOT_ID);
    if (shell) {
      return shell;
    }

    shell = document.createElement('div');
    shell.id = SHELL_ROOT_ID;
    shell.className = 'mzk-question-nav';
    shell.innerHTML = `
      <div class="mzk-question-nav__trigger" aria-label="Open question navigator">
        <span class="mzk-question-nav__trigger-bar"></span>
      </div>
      <aside class="mzk-question-nav__panel">
        <input
          type="text"
          class="mzk-question-nav__search"
          placeholder="Search questions"
          aria-label="Search questions"
        />
        <div class="mzk-question-nav__list"></div>
      </aside>
    `;

    document.body.appendChild(shell);
    return shell;
  }

  private bindHoverEvents(): void {
    this.trigger.addEventListener('mouseenter', () => {
      if (this.state === 'hidden') {
        return;
      }

      this.isOverTrigger = true;
      this.cancelCollapse();
      this.setState('expanded');
    });

    this.trigger.addEventListener('mouseleave', () => {
      this.isOverTrigger = false;
      this.tryScheduleCollapse();
    });

    this.panel.addEventListener('mouseenter', () => {
      if (this.state === 'hidden') {
        return;
      }

      this.isOverPanel = true;
      this.cancelCollapse();
      this.setState('expanded');
    });

    this.panel.addEventListener('mouseleave', () => {
      this.isOverPanel = false;
      this.tryScheduleCollapse();
    });
  }

  private bindSearchEvents(): void {
    this.searchInput.addEventListener('focus', () => {
      if (this.state === 'hidden') {
        return;
      }

      this.isSearchFocused = true;
      this.cancelCollapse();
      this.setState('expanded');
    });

    this.searchInput.addEventListener('blur', () => {
      this.isSearchFocused = false;
      this.tryScheduleCollapse();
    });

    this.searchInput.addEventListener('input', (event) => {
      this.searchKeyword = (event.target as HTMLInputElement).value;
      this.cancelCollapse();
      this.setState('expanded');
      this.applySearchFilter();
      this.renderList(this.filteredQuestions, this.getActiveId());
    });
  }

  private bindListEvents(): void {
    // Use event delegation to avoid rebinding listeners on each render.
    this.list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const followUpButton = target.closest<HTMLButtonElement>('.mzk-question-nav__follow-up');
      const button = target.closest<HTMLButtonElement>('.mzk-question-nav__item');
      const row = target.closest<HTMLElement>('.mzk-question-nav__row');
      const id = followUpButton?.dataset.id ?? button?.dataset.id ?? row?.dataset.id;
      if (!id) {
        return;
      }

      if (followUpButton) {
        event.stopPropagation();
        this.callbacks.onFollowUp(id);
        return;
      }

      if (!button) {
        return;
      }

      this.callbacks.onSelect(id);
    });
  }

  private setState(nextState: PanelVisibilityState): void {
    if (this.state === nextState) {
      return;
    }

    this.state = nextState;
    this.applyState();
  }

  private applyState(): void {
    this.shell.dataset.state = this.state;
  }

  private cancelCollapse(): void {
    if (this.collapseTimer !== null) {
      window.clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  private tryScheduleCollapse(): void {
    if (this.state === 'hidden') {
      return;
    }

    if (this.isOverPanel || this.isOverTrigger || this.isSearchFocused) {
      return;
    }

    this.setState('closing');
    this.cancelCollapse();
    this.collapseTimer = window.setTimeout(() => {
      this.collapseTimer = null;
      if (!this.isOverPanel && !this.isOverTrigger) {
        this.setState('collapsed');
      } else {
        this.setState('expanded');
      }
    }, COLLAPSE_DELAY_MS);
  }

  private updateVisibilityByCount(questionCount: number): void {
    if (questionCount <= 1) {
      this.cancelCollapse();
      this.isOverPanel = false;
      this.isOverTrigger = false;
      this.isSearchFocused = false;
      this.setState('hidden');
      return;
    }

    if (this.state === 'hidden') {
      this.setState('collapsed');
    }
  }

  private applySearchFilter(): void {
    const keyword = this.searchKeyword.trim().toLowerCase();

    if (!keyword) {
      this.filteredQuestions = [...this.allQuestions];
      return;
    }

    this.filteredQuestions = this.allQuestions.filter((item) =>
      item.title.toLowerCase().includes(keyword),
    );
  }

  private getActiveId(): string | null {
    return this.list.dataset.activeId ?? null;
  }

  private renderList(items: QuestionItem[], activeId: string | null): void {
    const previousScrollTop = this.list.scrollTop;
    const shouldKeepScroll = this.list.classList.contains('is-scrollable');
    this.list.classList.toggle('is-scrollable', items.length > MAX_VISIBLE_ITEMS);

    if (items.length === 0) {
      this.list.innerHTML = this.searchKeyword.trim()
        ? '<div class="mzk-question-nav__empty">未找到匹配的问题</div>'
        : '<div class="mzk-question-nav__empty">No questions yet</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'mzk-question-nav__row';
      row.dataset.id = item.id;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mzk-question-nav__item';
      button.dataset.id = item.id;
      if (item.id === activeId) {
        button.classList.add('is-active');
      }

      button.textContent = item.title;
      button.title = item.title;

      const followUpButton = document.createElement('button');
      followUpButton.type = 'button';
      followUpButton.className = 'mzk-question-nav__follow-up';
      followUpButton.dataset.id = item.id;
      followUpButton.textContent = '追问';
      followUpButton.title = '基于该问题继续追问';
      followUpButton.setAttribute('aria-label', `基于该问题继续追问：${item.title}`);

      row.appendChild(button);
      row.appendChild(followUpButton);
      fragment.appendChild(row);
    });

    this.list.replaceChildren(fragment);

    if (shouldKeepScroll || this.list.classList.contains('is-scrollable')) {
      this.list.scrollTop = previousScrollTop;
    }

    if (activeId) {
      const activeItem = this.list.querySelector<HTMLElement>(`.mzk-question-nav__row[data-id="${activeId}"]`);
      activeItem?.scrollIntoView({ block: 'nearest' });
    }
  }

  render(items: QuestionItem[], activeId: string | null): void {
    this.allQuestions = items;
    this.list.dataset.activeId = activeId ?? '';

    this.updateVisibilityByCount(this.allQuestions.length);
    if (this.state === 'hidden') {
      return;
    }

    this.applySearchFilter();
    this.renderList(this.filteredQuestions, activeId);
  }
}
