function escapeAttribute(value: string) {
  return value.replace(/[&"'<>]/g, character => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;" })[character] || character);
}

export const VIBEKIT_MINT = "8dZtFj1dd9zYZVvFi7rBuLebMKFqiuu2EmeeLhwopump";
// The verified image served on the token's Pump page. Its IPFS metadata URL is
// not consistently accessible in browsers, so use Pump's image CDN for this mint.
export const VIBEKIT_COIN_IMAGE = "https://images.pump.fun/coin-image/8dZtFj1dd9zYZVvFi7rBuLebMKFqiuu2EmeeLhwopump?variant=80x80&ipfs=bafybeicfrl4eb34ohebdspyqik6k3yoxoaalu3ho2p5aj2igbw5lch7oja&src=https%3A%2F%2Fipfs.io%2Fipfs%2Fbafybeicfrl4eb34ohebdspyqik6k3yoxoaalu3ho2p5aj2igbw5lch7oja";

export function tokenArtwork(imageUrl?: string, contractAddress?: string) {
  return contractAddress === VIBEKIT_MINT ? VIBEKIT_COIN_IMAGE : imageUrl;
}

export function ensureTokenImage(html: string, imageUrl?: string, tokenName?: string, contractAddress?: string) {
  const artworkUrl = tokenArtwork(imageUrl, contractAddress);
  if (!artworkUrl) return html;
  let image: URL;
  try {
    image = new URL(artworkUrl);
  } catch {
    return html;
  }
  if (image.protocol !== "https:") return html;
  const source = image.toString();
  // Keep the model's own image placement when it already used the token art.
  if ([...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .some(match => match[1].replace(/&amp;/g, "&") === source)) return html;

  const name = escapeAttribute(tokenName?.trim() || "Token");
  const artwork = `<div data-vibekit-token-art="true" style="width:max-content;max-width:100%;margin:0 0 24px;padding:6px;border-radius:26px;background:rgba(128,128,128,.12);line-height:0"><img src="${escapeAttribute(source)}" alt="${name} token artwork" width="128" height="128" loading="eager" style="display:block;width:128px;height:128px;max-width:100%;object-fit:cover;border-radius:20px"></div>`;
  if (/<h1\b/i.test(html)) return html.replace(/<h1\b/i, `${artwork}<h1`);
  if (/<main\b[^>]*>/i.test(html)) return html.replace(/<main\b[^>]*>/i, match => `${match}${artwork}`);
  return html.replace(/<body\b[^>]*>/i, match => `${match}${artwork}`);
}
