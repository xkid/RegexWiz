import React, { useMemo } from 'react';
import { MatchGroup } from '../types';

interface MatchHighlighterProps {
  text: string;
  regexPattern: string;
  flags: string;
}

const MatchHighlighter: React.FC<MatchHighlighterProps> = ({ text, regexPattern, flags }) => {
  const parts = useMemo<MatchGroup[]>(() => {
    if (!text) return [];
    if (!regexPattern) return [{ content: text, isMatch: false }];

    try {
      // Ensure 'g' flag is present for matchAll/exec loop to work correctly across the whole string
      const safeFlags = flags.includes('g') ? flags : flags + 'g';
      const regex = new RegExp(regexPattern, safeFlags);
      
      const result: MatchGroup[] = [];
      let lastIndex = 0;
      let match;

      // Prevent infinite loops with zero-width matches
      while ((match = regex.exec(text)) !== null) {
        // If we have text before the match, push it as non-match
        if (match.index > lastIndex) {
          result.push({
            content: text.slice(lastIndex, match.index),
            isMatch: false
          });
        }

        // Push the match itself
        result.push({
          content: match[0],
          isMatch: true,
          index: match.index
        });

        lastIndex = regex.lastIndex;

        // Avoid infinite loop if zero-width match (e.g. ^)
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }

      // Push remaining text
      if (lastIndex < text.length) {
        result.push({
          content: text.slice(lastIndex),
          isMatch: false
        });
      }

      return result;
    } catch (e) {
      // Swallow error: Invalid regex is expected during typing
      return [{ content: text, isMatch: false }];
    }
  }, [text, regexPattern, flags]);

  return (
    <div className="font-mono text-sm whitespace-pre-wrap break-all leading-relaxed text-gray-300">
      {parts.map((part, i) => (
        part.isMatch ? (
          <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5 border-b-2 border-yellow-500">
            {part.content}
          </mark>
        ) : (
          <span key={i}>{part.content}</span>
        )
      ))}
    </div>
  );
};

export default MatchHighlighter;