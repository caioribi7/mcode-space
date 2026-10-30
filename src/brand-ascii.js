// Sample the official logo rather than redrawing its geometry with characters.
export async function renderBrandAscii(target) {
  const image = new Image();
  image.src = 'assets/symbol.svg';
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const characters = 'MC0#*+';
  const lines = [];
  for (let y = 0; y < canvas.height; y++) {
    let line = '';
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      line += alpha > 140 ? characters[(x + y * 3) % characters.length] : alpha > 40 ? ':' : ' ';
    }
    lines.push(line);
  }
  target.textContent = lines.join('\n');
}
