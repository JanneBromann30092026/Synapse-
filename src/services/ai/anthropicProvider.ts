import Anthropic from '@anthropic-ai/sdk';
import { AI_TIMEOUT_MS } from './config';
import {
  buildGradingMessage,
  GRADE_TOOL,
  GRADE_TOOL_NAME,
  GRADING_SYSTEM_PROMPT,
  gradeToolInputSchema,
} from './gradingPrompt';
import {
  AiError,
  type AiCallOptions,
  type AiProvider,
  type ConnectionTestResult,
  type GradeRequest,
  type GradeResult,
} from './types';

interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
}

/** The part of the SDK client the provider uses (injectable for tests). */
export interface AnthropicClientLike {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: RequestOptions,
    ): Promise<Anthropic.Message>;
  };
  models: {
    retrieve(
      modelId: string,
      params?: undefined,
      options?: RequestOptions,
    ): Promise<Anthropic.ModelInfo>;
  };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Defaults to navigator.onLine. */
  isOnline?: () => boolean;
  createClient?: (apiKey: string) => AnthropicClientLike;
}

/** Small output; room for the always-on thinking of newer models if one is configured. */
const MAX_TOKENS = 2048;

/**
 * These models reject a forced tool_choice (400). They get `auto` plus the instruction in
 * the prompt; `strict: true` on the tool still guarantees schema-valid arguments.
 */
const AUTO_TOOL_CHOICE_MODELS = /^claude-(fable-5-1|mythos-5-1|opus-5-5|sonnet-5-5)/;

function defaultClient(apiKey: string): AnthropicClientLike {
  // The key comes from this device's own storage; requests go straight to api.anthropic.com.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

function browserOnline(): boolean {
  return globalThis.navigator?.onLine ?? true;
}

/** Maps SDK errors to stable codes (most specific first). Never includes request data. */
function toAiError(error: unknown, timedOut: boolean, online: boolean): AiError {
  if (error instanceof AiError) return error;
  if (timedOut || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError('TIMEOUT');
  }
  if (error instanceof Anthropic.APIUserAbortError) return new AiError('ABORTED');
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiError('AUTH', 'authentication failed', error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('RATE_LIMIT', 'rate limited', error.status);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError('MODEL_NOT_FOUND', 'model not found', error.status);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError(online ? 'NETWORK' : 'OFFLINE');
  }
  if (error instanceof Anthropic.APIError) {
    const status: number | undefined = typeof error.status === 'number' ? error.status : undefined;
    // 529 overloaded behaves like a rate limit for the user: try again shortly.
    if (status === 529) return new AiError('RATE_LIMIT', 'overloaded', 529);
    return new AiError('API_ERROR', `api error ${status ?? ''}`.trim(), status);
  }
  return new AiError('API_ERROR', error instanceof Error ? error.name : 'unknown error');
}

function isToolChoiceRejected(error: unknown): boolean {
  return error instanceof Anthropic.BadRequestError && /tool_choice/i.test(error.message);
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly isOnline: () => boolean;
  private readonly client: AnthropicClientLike;
  private forceToolChoice: boolean;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
    this.isOnline = options.isOnline ?? browserOnline;
    this.client = (options.createClient ?? defaultClient)(this.apiKey);
    this.forceToolChoice = !AUTO_TOOL_CHOICE_MODELS.test(this.model);
  }

  /** Runs one SDK call with the overall timeout, the caller's signal and error mapping. */
  private async call<T>(
    run: (options: RequestOptions) => Promise<T>,
    outer?: AbortSignal,
    /** Let a "tool_choice not supported" 400 through unmapped, so the caller can retry with auto. */
    passToolChoiceRejection = false,
  ): Promise<T> {
    if (!this.apiKey) throw new AiError('NO_API_KEY');
    if (!this.isOnline()) throw new AiError('OFFLINE');
    if (outer?.aborted) throw new AiError('ABORTED');

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      return await run({ signal: controller.signal, timeout: this.timeoutMs, maxRetries: 1 });
    } catch (error: unknown) {
      if (passToolChoiceRejection && !timedOut && isToolChoiceRejected(error)) throw error;
      throw toAiError(error, timedOut, this.isOnline());
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
  }

  private async requestGrade(
    input: GradeRequest,
    signal?: AbortSignal,
  ): Promise<Anthropic.Message> {
    const params = (force: boolean): Anthropic.MessageCreateParamsNonStreaming => ({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: GRADING_SYSTEM_PROMPT,
      tools: [GRADE_TOOL],
      tool_choice: force
        ? { type: 'tool', name: GRADE_TOOL_NAME, disable_parallel_tool_use: true }
        : { type: 'auto', disable_parallel_tool_use: true },
      messages: [{ role: 'user', content: buildGradingMessage(input) }],
    });
    try {
      return await this.call(
        (options) => this.client.messages.create(params(this.forceToolChoice), options),
        signal,
        this.forceToolChoice,
      );
    } catch (error: unknown) {
      if (!isToolChoiceRejected(error)) throw error;
      // A newer model that rejects forced tool use: remember and retry with `auto`.
      this.forceToolChoice = false;
      return this.call((options) => this.client.messages.create(params(false), options), signal);
    }
  }

  private parseGrade(message: Anthropic.Message): GradeResult | null {
    if (message.stop_reason === 'refusal') return null;
    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === GRADE_TOOL_NAME,
    );
    if (!toolUse) return null;
    const parsed = gradeToolInputSchema.safeParse(toolUse.input);
    if (!parsed.success) return null;
    return { ...parsed.data, model: message.model || this.model };
  }

  /** Grades an answer; an invalid model response is retried once before failing. */
  async gradeAnswer(input: GradeRequest, options: AiCallOptions = {}): Promise<GradeResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const message = await this.requestGrade(input, options.signal);
      const result = this.parseGrade(message);
      if (result) return result;
    }
    throw new AiError('INVALID_RESPONSE');
  }

  /** Looks up the configured model: validates key, network and model name without generating tokens. */
  async testConnection(options: AiCallOptions = {}): Promise<ConnectionTestResult> {
    const info = await this.call(
      (requestOptions) => this.client.models.retrieve(this.model, undefined, requestOptions),
      options.signal,
    );
    return { model: info.id, displayName: info.display_name || info.id };
  }
}
