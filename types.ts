export interface RegexResult {
  pattern: string;
  flags: string;
  explanation: string;
}

export interface MatchGroup {
  content: string;
  isMatch: boolean;
  index?: number;
}
