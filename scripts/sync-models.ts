import {
  parseApiPrice,
  SYNTHETIC_MODELS,
  type SyntheticModel,
} from "../extensions/provider/models";
import type { SyntheticApiModel } from "../src/client/types";

const API_URL = "https://api.synthetic.new/openai/v1/models";
const EPSILON = 0.001;

interface Difference {
  model: string;
  field: string;
  hardcoded: unknown;
  api: unknown;
}

async function fetchApiModels(): Promise<SyntheticApiModel[]> {
  const response = await fetch(API_URL, {
    headers: { Referer: "https://github.com/aliou/pi-synthetic" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`,
    );
  }

  const data: { data?: SyntheticApiModel[] } = await response.json();
  return data.data ?? [];
}

function compare(
  apiModels: SyntheticApiModel[],
  hardcodedModels: SyntheticModel[],
): Difference[] {
  const differences: Difference[] = [];

  for (const hardcoded of hardcodedModels) {
    const apiModel = apiModels.find((m) => m.id === hardcoded.id);

    if (!apiModel) {
      differences.push({
        model: hardcoded.id,
        field: "exists",
        hardcoded: true,
        api: false,
      });
      continue;
    }

    const apiInputs = [...apiModel.input_modalities].sort();
    const hardcodedInputs = [...hardcoded.input].sort();
    if (JSON.stringify(apiInputs) !== JSON.stringify(hardcodedInputs)) {
      differences.push({
        model: hardcoded.id,
        field: "input",
        hardcoded: hardcodedInputs,
        api: apiInputs,
      });
    }

    if (apiModel.context_length !== hardcoded.contextWindow) {
      differences.push({
        model: hardcoded.id,
        field: "contextWindow",
        hardcoded: hardcoded.contextWindow,
        api: apiModel.context_length,
      });
    }

    if (apiModel.max_output_length !== hardcoded.maxTokens) {
      differences.push({
        model: hardcoded.id,
        field: "maxTokens",
        hardcoded: hardcoded.maxTokens,
        api: apiModel.max_output_length,
      });
    }

    const apiInputCost = parseApiPrice(apiModel.pricing.prompt);
    if (Math.abs(apiInputCost - hardcoded.cost.input) > EPSILON) {
      differences.push({
        model: hardcoded.id,
        field: "cost.input",
        hardcoded: hardcoded.cost.input,
        api: apiInputCost,
      });
    }

    const apiOutputCost = parseApiPrice(apiModel.pricing.completion);
    if (Math.abs(apiOutputCost - hardcoded.cost.output) > EPSILON) {
      differences.push({
        model: hardcoded.id,
        field: "cost.output",
        hardcoded: hardcoded.cost.output,
        api: apiOutputCost,
      });
    }

    // The catalog stores the discounted cache-read rate (20% of the API list
    // price). Compare against the expected discounted value.
    const apiCacheReadCost = parseApiPrice(apiModel.pricing.input_cache_reads);
    const expectedCacheReadCost = Number((apiCacheReadCost * 0.2).toFixed(10));
    if (Math.abs(expectedCacheReadCost - hardcoded.cost.cacheRead) > EPSILON) {
      differences.push({
        model: hardcoded.id,
        field: "cost.cacheRead",
        hardcoded: hardcoded.cost.cacheRead,
        api: apiCacheReadCost,
      });
    }

    const apiReasoning =
      apiModel.supported_features?.includes("reasoning") ?? false;
    if (apiReasoning !== hardcoded.reasoning) {
      differences.push({
        model: hardcoded.id,
        field: "reasoning",
        hardcoded: hardcoded.reasoning,
        api: apiReasoning,
      });
    }
  }

  for (const apiModel of apiModels) {
    const hardcoded = hardcodedModels.find((m) => m.id === apiModel.id);
    if (!hardcoded) {
      differences.push({
        model: apiModel.id,
        field: "exists",
        hardcoded: false,
        api: true,
      });
    }
  }

  return differences;
}

function formatDifferences(differences: Difference[]): string {
  const lines: string[] = [
    "Upstream Synthetic model changes detected.",
    "",
    `Compared against ${API_URL}. The hardcoded catalog stores cache-read prices at 20% of the API list price.`,
    "",
    "| Model | Field | Hardcoded | API |",
    "|---|---|---|---|",
  ];

  for (const d of differences) {
    if (d.field === "exists") {
      if (d.hardcoded) {
        lines.push(`| ${d.model} | exists | in catalog | missing from API |`);
      } else {
        lines.push(
          `| ${d.model} | exists | missing from catalog | in API (new model) |`,
        );
      }
    } else {
      lines.push(
        `| ${d.model} | ${d.field} | ${JSON.stringify(d.hardcoded)} | ${JSON.stringify(d.api)} |`,
      );
    }
  }

  lines.push("", "Update `extensions/provider/models.ts` accordingly.");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const apiModels = await fetchApiModels();
  const differences = compare(apiModels, SYNTHETIC_MODELS);

  if (differences.length === 0) {
    console.log("No differences found between hardcoded catalog and API.");
    return;
  }

  console.log(formatDifferences(differences));
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
