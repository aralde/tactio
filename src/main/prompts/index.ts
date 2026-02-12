/**
 * Centralized prompt management for Tactio.
 * This module contains system instructions and helper functions to format prompts.
 */

export const SystemStyles = {
    PROFESSIONAL: "System: Respond in a highly professional, business-appropriate tone.\n",
    CASUAL: "System: Respond in a casual, friendly, and conversational tone.\n",
    CONCISE: "System: Respond strictly with the requested information. Do not add any introductory or concluding remarks. No formatting unless requested.\n"
};

/**
 * Formats the base prompt by combining the user's prompt and the selected text.
 * @param prompt The user's custom prompt or instruction.
 * @param text The text selected by the user to be processed.
 * @returns The formatted prompt string.
 */
export function formatBasePrompt(prompt: string, text: string): string {
    return `${prompt}
    
    Constraints (CRITICAL):
    Output ONLY the rewritten text.
    DO NOT include any introductory filler (e.g., "Here is the new version," "Sure, I can do that").
    DO NOT explain what changes you made.
    Start the response immediately with the first word of the rewritten content.
    ----------
    Input Text:
    "${text}"`;
}
