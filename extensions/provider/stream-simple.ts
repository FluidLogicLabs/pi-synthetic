// Synthetic's response body reports cache-read token counts, but not the
// billing mode used for the request. Synthetic applies an 80% discount to
// cached reads for both subscription and PAYG billing, so this wrapper
// adjusts the finalized assistant usage cost accordingly.
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
  type Usage,
} from "@earendil-works/pi-ai";

// Synthetic's public docs describe subscription credits and cache token fields,
// but do not document the cache-read discount. Both subscription and PAYG
// billing now bill cached reads at 20% of the raw cache-read price returned by
// /openai/v1/models (i.e. an 80% discount).
const CACHE_READ_MULTIPLIER = 0.2;

export type SyntheticStreamSimple = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export function calculateSyntheticUsageCost(
  model: Pick<Model<Api>, "cost">,
  usage: Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite">,
): Usage["cost"] {
  const cacheReadRate = model.cost.cacheRead * CACHE_READ_MULTIPLIER;

  const input = (model.cost.input / 1_000_000) * usage.input;
  const output = (model.cost.output / 1_000_000) * usage.output;
  const cacheRead = (cacheReadRate / 1_000_000) * usage.cacheRead;
  const cacheWrite = (model.cost.cacheWrite / 1_000_000) * usage.cacheWrite;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

function withAdjustedUsageCost(
  model: Model<Api>,
  message: AssistantMessage,
): AssistantMessage {
  return {
    ...message,
    usage: {
      ...message.usage,
      cost: calculateSyntheticUsageCost(model, message.usage),
    },
  };
}

function adjustFinalEventCost(
  model: Model<Api>,
  event: AssistantMessageEvent,
): AssistantMessageEvent {
  if (event.type === "done") {
    return {
      ...event,
      message: withAdjustedUsageCost(model, event.message),
    };
  }

  if (event.type === "error") {
    return {
      ...event,
      error: withAdjustedUsageCost(model, event.error),
    };
  }

  return event;
}

function createErrorMessage(model: Model<Api>, err: unknown): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: "synthetic",
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: calculateSyntheticUsageCost(model, {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      }),
    },
    stopReason: "error",
    errorMessage: err instanceof Error ? err.message : String(err),
    timestamp: Date.now(),
  };
}

async function forwardSyntheticStream(
  inner: AssistantMessageEventStream,
  outer: AssistantMessageEventStream,
  model: Model<Api>,
): Promise<void> {
  let terminated = false;
  try {
    for await (const event of inner) {
      const adjusted = adjustFinalEventCost(model, event);
      if (adjusted.type === "done" || adjusted.type === "error") {
        terminated = true;
      }
      outer.push(adjusted);
    }
  } catch (err) {
    // The streamSimple contract says errors are encoded as stream error
    // events, but if an unexpected exception escapes, emit one so consumers
    // waiting on result() get a terminal event instead of a hung stream.
    outer.push({
      type: "error",
      reason: "error",
      error: createErrorMessage(model, err),
    });
    terminated = true;
  } finally {
    // If the base stream ended without a terminal done/error event, emit a
    // fallback error so result() resolves instead of hanging forever.
    if (!terminated) {
      outer.push({
        type: "error",
        reason: "error",
        error: createErrorMessage(
          model,
          new Error("synthetic stream ended without a terminal event"),
        ),
      });
    }
    outer.end();
  }
}

export function wrapSyntheticStreamSimple(
  base: SyntheticStreamSimple,
): SyntheticStreamSimple {
  return (model, context, options = {}) => {
    const outer = createAssistantMessageEventStream();
    const inner = base(model, context, options);
    void forwardSyntheticStream(inner, outer, model);
    return outer;
  };
}
