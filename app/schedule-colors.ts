type TimedColorBlock = { start: string; color: string };

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

export function scheduleTimeColor(index: number) {
  return hslToHex((index * 137.508 + 350) % 360, 58, 85);
}

export function colorBlocksByTime<T extends TimedColorBlock>(blocks: T[], toMinutes: (value: string) => number): T[] {
  const orderedStarts = Array.from(new Set(blocks.map((block) => toMinutes(block.start)))).sort((first, second) => first - second);
  const colors = new Map(orderedStarts.map((start, index) => [start, scheduleTimeColor(index)]));
  return blocks.map((block) => ({ ...block, color: colors.get(toMinutes(block.start)) ?? block.color }));
}
