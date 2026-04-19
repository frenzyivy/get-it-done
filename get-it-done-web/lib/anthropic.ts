import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase-admin';

export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

let anthropicClient: Anthropic | null = null;

function anthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return anthropicClient;
}

export type AgentKey =
  | 'generate_subtasks'
  | 'smart_tag'
  | 'estimate_task'
  | 'smart_priority'
  | 'daily_summary'
  | 'weekly_insights';

interface RunAgentArgs {
  userId: string;
  agent: AgentKey;
  system: string;
  user: string;
  maxTokens?: number;
  requestPayload?: Record<string, unknown>;
}

interface AgentResult<T> {
  data: T;
  raw: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Calls Claude, extracts the first JSON object/array from the response, and
 * logs the full exchange to `ai_logs` — success or failure.
 */
export async function runAgent<T>(args: RunAgentArgs): Promise<AgentResult<T>> {
  const { userId, agent, system, user, maxTokens = 1024, requestPayload } = args;
  const admin = supabaseAdmin();
  const started = Date.now();

  try {
    const response = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const parsed = extractJson<T>(raw);

    await admin.from('ai_logs').insert({
      user_id: userId,
      agent,
      model: CLAUDE_MODEL,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      duration_ms: Date.now() - started,
      success: true,
      request_payload: requestPayload ?? null,
      response_payload: parsed as unknown as Record<string, unknown>,
    });

    return {
      data: parsed,
      raw,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from('ai_logs').insert({
      user_id: userId,
      agent,
      model: CLAUDE_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: Date.now() - started,
      success: false,
      error_message: message,
      request_payload: requestPayload ?? null,
    });
    throw err;
  }
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error(`Claude response contained no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]) as T;
}
