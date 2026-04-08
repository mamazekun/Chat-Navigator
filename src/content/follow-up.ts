import { QuestionItem } from '../utils/types';

const FOLLOW_UP_HISTORY_PREFIX = '回到刚才的问题：';
const FOLLOW_UP_MARKER = '在这个基础上，我想进一步追问：';

function isOrdinaryQuestionText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return !normalized.includes(FOLLOW_UP_HISTORY_PREFIX)
    && !normalized.includes(FOLLOW_UP_MARKER);
}

export function canFollowUpQuestion(item: QuestionItem, followedUpQuestionIds: Set<string>): boolean {
  const sourceText = item.text || item.title;
  if (!isOrdinaryQuestionText(sourceText)) {
    return false;
  }

  return !followedUpQuestionIds.has(item.id);
}

