export function roleColor(roleName: string) {
  const normalized = roleName.trim().toLocaleLowerCase();
  let hash = 2166136261;
  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const unsignedHash = hash >>> 0;
  const hue = unsignedHash % 360;
  const saturation = 58 + ((unsignedHash >>> 9) % 3) * 6;
  const lightness = 73 + ((unsignedHash >>> 13) % 3) * 4;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

const newRolePalette = [
  "#8fb8ed", "#ec8f8a", "#8eddb0", "#d595df", "#f1bd72", "#79ccd8",
  "#a9a0e8", "#e58abb", "#b6dc7f", "#83b8d9", "#ef9f72", "#79d5c0",
];

export function nextRoleColor(existingColors: Array<string | undefined>) {
  const usedColors = new Set(existingColors.filter(Boolean).map((color) => color!.toLowerCase()));
  const unusedColor = newRolePalette.find((color) => !usedColors.has(color));
  if (unusedColor) return unusedColor;

  // Keep producing distinct, color-input-compatible defaults after the curated palette is exhausted.
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const hue = Math.round((existingColors.length * 137.508 + attempt * 47) % 360);
    const color = hslToHex(hue, 58, 75);
    if (!usedColors.has(color)) return color;
  }
  return newRolePalette[existingColors.length % newRolePalette.length];
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs(segment % 2 - 1));
  const [red, green, blue] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const match = l - chroma / 2;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function moveRoleOptionIndex(currentIndex: number, optionCount: number, key: "ArrowDown" | "ArrowUp" | "Home" | "End") {
  if (optionCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowDown") return currentIndex < 0 || currentIndex >= optionCount - 1 ? 0 : currentIndex + 1;
  return currentIndex <= 0 ? optionCount - 1 : currentIndex - 1;
}
