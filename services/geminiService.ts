import { GoogleGenAI, Type } from "@google/genai";
import { RegexResult } from '../types';

export const generateRegexFromPrompt = async (
  dataSnippet: string,
  userPrompt: string
): Promise<RegexResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Truncate data snippet if it's too long to save context, 
  // but keep enough to understand the structure.
  const truncatedData = dataSnippet.length > 2000 
    ? dataSnippet.substring(0, 2000) + "...(truncated)" 
    : dataSnippet;

  const promptText = `
    You are a Regular Expression expert. 
    Your task is to generate a JavaScript-compatible regular expression based on the user's requirement and the provided sample data.
    
    Sample Data:
    \`\`\`
    ${truncatedData}
    \`\`\`

    User Requirement:
    "${userPrompt}"

    Strictly return a JSON object with the following properties:
    - regex: The regular expression pattern string (without delimiters). Escape backslashes correctly for a JSON string.
    - flags: The flags for the regex (e.g., "gm", "i").
    - explanation: A concise explanation of how the regex works.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Using pro model for complex coding logic
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            regex: { type: Type.STRING, description: "The regex pattern, e.g. ^[a-z]+$" },
            flags: { type: Type.STRING, description: "Regex flags, e.g. gm" },
            explanation: { type: Type.STRING, description: "How it works" },
          },
          required: ["regex", "flags", "explanation"],
        },
      },
    });

    const text = response.text;
    if (!text) {
        throw new Error("No response from AI");
    }
    
    return JSON.parse(text) as RegexResult;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate regex. Please try again.");
  }
};
