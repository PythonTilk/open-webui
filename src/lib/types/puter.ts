/**
 * Puter.js SDK Type Definitions for Open-WebUI
 * 
 * These types describe the Puter.js browser SDK which provides
 * free access to AI models via OpenRouter.
 */

export interface PuterUser {
  uuid: string;
  username: string;
  email?: string;
  email_confirmed?: boolean;
}

export interface PuterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PuterChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface PuterChatResponse {
  message: {
    role: 'assistant';
    content: string;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface PuterStreamChunk {
  text?: string;
}

export interface PuterModel {
  id: string;
  name?: string;
  provider?: string;
  endpoint?: string;
}

export interface PuterCustomModel {
  id: string;
  endpoint?: string;
}

export interface PuterErrorResponse {
  success: false;
  error?: {
    message?: string;
    code?: string;
  };
}

export interface PuterAuth {
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  isSignedIn: () => boolean;
  getUser: () => Promise<PuterUser>;
}

export interface PuterAI {
  chat: (
    messages: PuterChatMessage[],
    options?: PuterChatOptions
  ) => Promise<PuterChatResponse | AsyncIterable<PuterStreamChunk>>;
  listModels: () => Promise<PuterModel[]>;
}

export interface Puter {
  auth: PuterAuth;
  ai: PuterAI;
}

export interface PuterAuthState {
  isSignedIn: boolean;
  user: PuterUser | null;
}

// Extend Window to include puter
declare global {
  interface Window {
    puter?: Puter;
  }
}
