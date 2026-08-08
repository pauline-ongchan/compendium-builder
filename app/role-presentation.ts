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

export function moveRoleOptionIndex(currentIndex: number, optionCount: number, key: "ArrowDown" | "ArrowUp" | "Home" | "End") {
  if (optionCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowDown") return currentIndex < 0 || currentIndex >= optionCount - 1 ? 0 : currentIndex + 1;
  return currentIndex <= 0 ? optionCount - 1 : currentIndex - 1;
}
