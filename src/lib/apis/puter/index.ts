/**
 * Puter.js API Client for Open-WebUI
 * 
 * This module provides a frontend-only AI provider using Puter.js SDK.
 * All requests are handled directly in the browser - no backend required.
 */

import type {
  Puter,
  PuterUser,
  PuterModel,
  PuterChatMessage,
  PuterChatOptions,
  PuterChatResponse,
  PuterStreamChunk,
  PuterAuthState,
  PuterErrorResponse,
  PuterCustomModel
} from '$lib/types/puter';

/**
 * Check if Puter SDK is loaded
 */
export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.puter !== 'undefined';
}

/**
 * Get the Puter SDK instance
 * @throws Error if Puter SDK is not loaded
 */
export function getPuter(): Puter {
  if (!isPuterAvailable()) {
    throw new Error('Puter SDK is not loaded. Make sure the script is included in app.html.');
  }
  return window.puter as Puter;
}

/**
 * Sign in with Puter - opens a popup for authentication
 * @returns Promise resolving to true if sign-in successful
 */
export async function signIn(): Promise<boolean> {
  const puter = getPuter();
  try {
    const result = await puter.auth.signIn();
    return result;
  } catch (error) {
    console.error('Puter sign-in error:', error);
    throw error;
  }
}

/**
 * Sign out from Puter
 */
export async function signOut(): Promise<void> {
  const puter = getPuter();
  await puter.auth.signOut();
}

/**
 * Check if user is currently signed in
 */
export function isSignedIn(): boolean {
  if (!isPuterAvailable()) {
    return false;
  }
  return getPuter().auth.isSignedIn();
}

/**
 * Get current user information
 * @returns User info or null if not signed in
 */
export async function getUser(): Promise<PuterUser | null> {
  if (!isSignedIn()) {
    return null;
  }
  try {
    const user = await getPuter().auth.getUser();
    return user;
  } catch (error) {
    console.error('Error getting Puter user:', error);
    return null;
  }
}

/**
 * Get current authentication state
 */
export async function getAuthState(): Promise<PuterAuthState> {
  const signedIn = isSignedIn();
  const user = signedIn ? await getUser() : null;
  return {
    isSignedIn: signedIn,
    user
  };
}

export interface PuterStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string, usage?: { prompt_tokens: number; completion_tokens: number }) => void;
  onError: (error: Error) => void;
}

/**
 * Send a chat message with streaming support
 * @param messages - Array of messages in Puter format
 * @param options - Chat options (model, temperature, etc.)
 * @param callbacks - Streaming callbacks for token updates
 * @returns AbortController to cancel the request
 */
export async function chat(
  messages: PuterChatMessage[],
  options: PuterChatOptions,
  callbacks: PuterStreamCallbacks
): Promise<AbortController> {
  console.log('[Puter] chat called with', { messages, options });
  const puter = getPuter();
  const abortController = new AbortController();

  const chatPromise = (async () => {
    try {
      console.log('[Puter] Calling puter.ai.chat...');

      // Puter API can accept either (prompt, options) or (messages, options)
      // The SDK auto-detects based on the type of the first argument
      const response = await puter.ai.chat(messages, {
        ...options,
        stream: true
      });

      // Check for error response from Puter API
      if (response && typeof response === 'object' && 'success' in response) {
        const errorResponse = response as unknown as PuterErrorResponse;
        if (!errorResponse.success) {
          console.error('[Puter] Puter API returned error:', errorResponse.error);
          const errorMessage =
            errorResponse.error?.message ||
            errorResponse.error?.code ||
            'Puter API error';
          throw new Error(errorMessage);
        }
      }

      let fullText = '';

      // Handle streaming response
      if (Symbol.asyncIterator in Object(response)) {
        for await (const chunk of response as AsyncIterable<PuterStreamChunk>) {
          if (abortController.signal.aborted) {
            break;
          }

          if (chunk?.text) {
            fullText += chunk.text;
            callbacks.onToken(chunk.text);
          }
        }
        callbacks.onComplete(fullText, undefined);
      } else {
        // Non-streaming fallback
        const result = response as PuterChatResponse;
        fullText = result.message.content;
        callbacks.onToken(fullText);
        callbacks.onComplete(fullText, result.usage);
      }
    } catch (error) {
      console.error('[Puter] Chat error:', error);
      if (!abortController.signal.aborted) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  })();

  chatPromise.catch(() => {
    // Error already handled in callbacks
  });

  return abortController;
}

/**
 * Send a non-streaming chat message
 * @param messages - Array of messages in Puter format
 * @param options - Chat options (model, temperature, etc.)
 * @returns The complete response
 */
export async function chatSync(
  messages: PuterChatMessage[],
  options: Omit<PuterChatOptions, 'stream'>
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const puter = getPuter();

  const response = await puter.ai.chat(messages, {
    ...options,
    stream: false
  });

  const result = response as PuterChatResponse;
  return {
    text: result.message.content,
    usage: result.usage
  };
}

/**
 * List available AI models from Puter API (not used by default, kept for reference)
 * @returns Array of available models
 */
export async function listModels(): Promise<PuterModel[]> {
  const puter = getPuter();
  try {
    const models = await puter.ai.listModels();
    return models;
  } catch (error) {
    console.error('Error listing Puter models:', error);
    return [];
  }
}

/**
 * Curated list of popular/important Puter models
 * These are the built-in models that work reliably without OpenRouter
 */
export const CURATED_PUTER_MODELS: PuterModel[] = [
  // OpenAI Models
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'openai' },
  { id: 'o1', name: 'o1', provider: 'openai' },
  { id: 'o1-mini', name: 'o1 Mini', provider: 'openai' },
  { id: 'o3-mini', name: 'o3 Mini', provider: 'openai' },
  
  // Anthropic Claude Models
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  
  // Google Gemini Models  
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
  
  // DeepSeek Models
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek' },
  
  // Mistral Models
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral' },
  { id: 'mistral-small-2506', name: 'Mistral Small', provider: 'mistral' },
  
  // xAI Grok Models
  { id: 'grok-3', name: 'Grok 3', provider: 'xai' },
  { id: 'grok-3-mini', name: 'Grok 3 Mini', provider: 'xai' },
];

/**
 * Get curated models list (doesn't require API call)
 */
export function getCuratedModels(): PuterModel[] {
  return CURATED_PUTER_MODELS;
}

/**
 * Get models - returns curated list plus any custom models from settings
 * @param customModels - Array of custom model objects with id and optional endpoint
 */
export function getModelsWithCustom(customModels: PuterCustomModel[] = []): PuterModel[] {
  const curated = getCuratedModels();
  
  // Add custom models (filter out any that are already in curated list)
  const curatedIds = new Set(curated.map(m => m.id));
  const custom = customModels
    .filter(m => m && m.id && m.id.trim() && !curatedIds.has(m.id.trim()))
    .map(m => ({
      id: m.id.trim(),
      name: m.id.trim(),
      provider: m.id.includes(':') ? m.id.split(':')[0] : 'custom',
      endpoint: m.endpoint?.trim() || undefined
    }));
  
  return [...curated, ...custom];
}

/**
 * Get models (returns curated list - no API call needed)
 */
export async function getModels(): Promise<PuterModel[]> {
  return getCuratedModels();
}

/**
 * Clear the models cache (no-op now, kept for compatibility)
 */
export function clearModelsCache(): void {
  // No-op - we use curated list now
}

/**
 * Legacy - kept for compatibility
 */
export const DEFAULT_PUTER_MODELS = CURATED_PUTER_MODELS.map(m => m.id);

/**
 * Generate a title for a conversation using Puter AI
 */
export async function generateTitle(
  userMessage: string,
  assistantMessage: string
): Promise<string> {
  try {
    const result = await chatSync(
      [
        {
          role: 'system',
          content:
            'Generate a very brief title (3-6 words) for this conversation. Reply with ONLY the title, no quotes or punctuation.'
        },
        {
          role: 'user',
          content: `User: ${userMessage.slice(0, 200)}\n\nAssistant: ${assistantMessage.slice(0, 200)}`
        }
      ],
      { model: 'gpt-4o-mini', temperature: 0.7 }
    );
    return result.text.trim().slice(0, 100);
  } catch (error) {
    console.error('[Puter] Failed to generate title:', error);
    return 'New Chat';
  }
}
