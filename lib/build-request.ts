const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function resolveBuildRequest(
  source: "prompt" | "import" | "screenshot",
  prompt: string,
  importValue: string,
  tokenInput: string,
) {
  const entered = tokenInput.trim();
  const tokenAddress = SOLANA_ADDRESS.test(entered) ? entered : "";
  const extraInstructions = tokenAddress ? "" : entered;
  const imported = importValue.trim();
  const base = source === "import"
    ? imported ? `Create a polished Solana project site from ${imported}` : ""
    : source === "screenshot"
      ? prompt.trim() || "Recreate this visual direction for a Solana token community"
      : prompt.trim();
  const request = [base, extraInstructions].filter(Boolean).join("\n") ||
    (tokenAddress ? `Create a polished Solana token website for ${tokenAddress}` : "");
  return { request, tokenAddress };
}
