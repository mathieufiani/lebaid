// scripts/generate-icons.js
const sharp = require('sharp');
const path = require('path');

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#CC0001"/>
  <text x="256" y="320" font-family="Arial, sans-serif" font-size="280" font-weight="bold" fill="white" text-anchor="middle">L</text>
</svg>`;

async function generate() {
  const buf = Buffer.from(svgIcon);
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');

  await sharp(buf).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  await sharp(buf).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  console.log('Icons generated successfully.');
}

generate().catch(console.error);
