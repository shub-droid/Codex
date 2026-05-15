import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

// Initialize Groq client
// Note: Requires GROQ_INLINE_API_KEY in the .env file
const groq = new Groq({
    apiKey: process.env.GROQ_INLINE_API_KEY || '',
    timeout: 30_000,
});

const MODEL = 'llama-3.1-8b-instant';

/**
 * Get an inline code suggestion based on the prefix and suffix around the cursor.
 * 
 * @param {string} prefix Text before the cursor
 * @param {string} suffix Text after the cursor
 * @param {string} language The programming language of the file
 * @param {string} filename The name of the file
 * @returns {Promise<string>} The suggested code completion
 */
export async function getInlineSuggestion(prefix, suffix, language, filename) {
    if (!process.env.GROQ_INLINE_API_KEY) {
        throw new Error('GROQ_INLINE_API_KEY is not configured');
    }

    // A prompt designed for "Fill-In-The-Middle" (FIM) or inline completion
    const prompt = `You are an expert AI coding assistant.
Your task is to provide the missing code that belongs exactly at the <CURSOR> position.
Only provide the raw code snippet that seamlessly connects the PREFIX and SUFFIX. 
Do not include any explanations, markdown code blocks (like \`\`\`js), or conversational text. 
If no code is needed, just output an empty response.

File: ${filename}
Language: ${language}

PREFIX:
${prefix}
<CURSOR>
SUFFIX:
${suffix}`;

    try {
        const completion = await groq.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: 0.2, // Low temperature for more deterministic, accurate code completion
            max_tokens: 256, // Keep it short for fast inline suggestions
        });

        // Clean up the response
        let text = completion.choices[0]?.message?.content || '';
        text = text.trim();

        // Sometimes the model might still return markdown code blocks despite instructions, so we clean them up
        if (text.startsWith('\`\`\`')) {
            const lines = text.split('\n');
            if (lines.length > 1) {
                // Remove first line (e.g. ```javascript)
                lines.shift();
                // Remove last line if it's just ``` 
                if (lines[lines.length - 1].trim() === '\`\`\`') {
                    lines.pop();
                }
                text = lines.join('\n');
            }
        }

        return text;
    } catch (error) {
        console.error('Error getting inline suggestion from Groq:', error);
        return '';
    }
}
