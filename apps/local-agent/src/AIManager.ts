import type { DevIdentityRecord, BackendTraceEvent, SourcePosition } from '@devbridge/protocol';

export type AIProviderName = 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';

export interface AIProviderConfig {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AiQuickFixSuggestion {
  explanation: string;
  replacement: string;
  start: SourcePosition;
  end: SourcePosition;
  /** 1-indexed line range, kept for back-compat with simple UIs */
  startLine: number;
  endLine: number;
}

const DEFAULT_MODELS: Record<AIProviderName, string> = {
  gemini: process.env.DEVBRIDGE_GEMINI_MODEL || 'gemini-2.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  'openai-compatible': 'default',
};

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

function parseModelJson(raw: string, providerLabel: string): { explanation: string; replacement: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    const err: any = new Error(`${providerLabel} returned non-JSON output.`);
    err.statusCode = 502;
    throw err;
  }
  if (typeof parsed.replacement !== 'string' || !parsed.replacement.trim()) {
    const err: any = new Error(`${providerLabel} response missing "replacement" string.`);
    err.statusCode = 502;
    throw err;
  }
  return {
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : 'Suggested AI Fix',
    replacement: parsed.replacement,
  };
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return res.statusText;
  }
}

async function readJsonBody(res: Response, providerLabel: string): Promise<any> {
  try {
    return await res.json();
  } catch {
    const err: any = new Error(`${providerLabel} returned invalid JSON (non-JSON response).`);
    err.statusCode = 502;
    throw err;
  }
}

export class AIManager {
  // defaultApiKey kept for back-compat (previously Gemini-only constructor arg).
  constructor(private defaultApiKey?: string) {}

  public resolveConfig(config?: Partial<AIProviderConfig>): AIProviderConfig {
    const provider = (config?.provider || (process.env.AI_PROVIDER as AIProviderName) || 'gemini') as AIProviderName;
    if (provider !== 'gemini' && provider !== 'openai' && provider !== 'anthropic' && provider !== 'openai-compatible') {
      const err: any = new Error(`Unsupported AI provider: ${provider}`);
      err.statusCode = 400;
      throw err;
    }
    const apiKey =
      config?.apiKey ||
      process.env.AI_API_KEY ||
      (provider === 'gemini' ? this.defaultApiKey || process.env.GEMINI_API_KEY : undefined) ||
      '';
    // Local gateways (Ollama etc.) typically need no key — allow empty only there.
    if (!apiKey && provider !== 'openai-compatible') {
      const err: any = new Error(
        `API key for provider '${provider}' is not configured. Set AI_API_KEY (or GEMINI_API_KEY for gemini) or supply one in the panel's Enterprise AI Settings.`
      );
      err.statusCode = 500;
      throw err;
    }
    const model = config?.model || process.env.AI_MODEL || DEFAULT_MODELS[provider];
    // Custom base URLs only apply to OpenAI-compatible gateways; ignoring them
    // elsewhere prevents the local agent from becoming an open proxy.
    const baseUrl =
      provider === 'openai-compatible'
        ? config?.baseUrl || process.env.AI_BASE_URL || 'http://127.0.0.1:11434/v1'
        : undefined;
    return { provider, apiKey, model, baseUrl };
  }

  public async generateQuickFix(
    record: DevIdentityRecord,
    sourceSnippet: string,
    errorContext?: BackendTraceEvent,
    config?: Partial<AIProviderConfig>
  ): Promise<AiQuickFixSuggestion> {
    if (!sourceSnippet?.trim()) {
      const err: any = new Error('Empty source snippet — cannot generate AI fix.');
      err.statusCode = 400;
      throw err;
    }
    const resolved = this.resolveConfig(config);

    const systemPrompt =
      "You are an expert AI software engineer embedded inside DevBridge. Output strict JSON with keys: 'explanation' and 'replacement'. Do not wrap in markdown blocks.";
    const userPrompt = [
      `Component Name: ${record.componentName}`,
      `Tag: ${record.tagName}`,
      `File: ${record.file}`,
      'Source Snippet:',
      '```tsx',
      sourceSnippet.slice(0, 8000),
      '```',
      '',
      'Backend Error / Trace Context:',
      errorContext ? JSON.stringify(errorContext, null, 2).slice(0, 4000) : 'None (Pure UI/Tailwind task)',
      '',
      `Provide the exact replacement code string for the JSX element starting at line ${record.start.line} (valid TSX that can directly replace that element).`,
    ].join('\n');

    let parsed: { explanation: string; replacement: string };
    if (resolved.provider === 'gemini') {
      parsed = await this.callGemini(resolved.apiKey, resolved.model, systemPrompt, userPrompt);
    } else if (resolved.provider === 'openai' || resolved.provider === 'openai-compatible') {
      parsed = await this.callOpenAIStyle(
        resolved.apiKey || 'not-needed',
        resolved.model,
        systemPrompt,
        userPrompt,
        resolved.baseUrl || 'https://api.openai.com/v1'
      );
    } else {
      parsed = await this.callAnthropic(resolved.apiKey, resolved.model, systemPrompt, userPrompt);
    }

    return {
      ...parsed,
      start: { ...record.start },
      end: { ...record.end },
      startLine: record.start.line,
      endLine: record.end.line,
    };
  }

  private async callGemini(apiKey: string, model: string, system: string, user: string) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
    } catch (err: any) {
      const wrapped: any = new Error(`Gemini request failed: ${err.message}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }
    if (!res.ok) {
      const err: any = new Error(`Gemini API Error (${res.status}): ${await readErrorBody(res)}`);
      err.statusCode = 502;
      throw err;
    }
    const data = await readJsonBody(res, 'Gemini');
    const rawText: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText?.trim()) {
      const err: any = new Error('Empty response from Gemini API.');
      err.statusCode = 502;
      throw err;
    }
    return parseModelJson(rawText, 'Gemini');
  }

  private async callOpenAIStyle(apiKey: string, model: string, system: string, user: string, baseUrl: string) {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${normalizedBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
        }),
      });
    } catch (err: any) {
      const wrapped: any = new Error(`OpenAI-compatible request failed: ${err.message}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }
    if (!res.ok) {
      const err: any = new Error(`OpenAI-compatible API Error (${res.status}): ${await readErrorBody(res)}`);
      err.statusCode = 502;
      throw err;
    }
    const data = await readJsonBody(res, 'OpenAI-compatible API');
    const rawText: string | undefined = data.choices?.[0]?.message?.content;
    if (!rawText?.trim()) {
      const err: any = new Error('Empty response from OpenAI-compatible API.');
      err.statusCode = 502;
      throw err;
    }
    return parseModelJson(rawText, 'OpenAI-compatible');
  }

  private async callAnthropic(apiKey: string, model: string, system: string, user: string) {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system,
          messages: [{ role: 'user', content: user }],
          max_tokens: 1024,
        }),
      });
    } catch (err: any) {
      const wrapped: any = new Error(`Anthropic request failed: ${err.message}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }
    if (!res.ok) {
      const err: any = new Error(`Anthropic API Error (${res.status}): ${await readErrorBody(res)}`);
      err.statusCode = 502;
      throw err;
    }
    const data = await readJsonBody(res, 'Anthropic');
    const rawText: string | undefined =
      typeof data.content?.[0]?.text === 'string'
        ? data.content[0].text
        : Array.isArray(data.content)
          ? data.content.map((b: any) => b?.text || '').join('')
          : undefined;
    if (!rawText?.trim()) {
      const err: any = new Error('Empty response from Anthropic API.');
      err.statusCode = 502;
      throw err;
    }
    return parseModelJson(rawText, 'Anthropic');
  }
}
