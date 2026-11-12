// Compares the screenshots reproduce.sh takes around each card, and exits 1 while a card's radii as percentages give it
// another elevation shadow than the same radii in dp, 0 once they give the same one, 2 when the comparison shows nothing.
// Usage: node compare-shadows.mjs <radii in dp.png> <radii as percentages.png> <radii in dp again.png> <screen WxH>
//   <margin in px> "<card name>=<left>,<top>,<right>,<bottom>"...
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// A channel this far apart is the shadow moving, not antialiasing rounding the same edge another way.
const channelTolerance = 3;

function fail(message) {
  console.log(`step failed: ${message}`);
  process.exit(2);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

function predictor(filter, left, up, upLeft) {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, upLeft);
    default:
      throw new Error(`unknown PNG row filter ${filter}`);
  }
}

function decodePng(path) {
  const file = readFileSync(path);
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [bitDepth, colorType] = [body[8], body[9]];
      const interlaced = body[12] !== 0;
      if (bitDepth !== 8 || interlaced || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`${path} is not an 8-bit, non-interlaced RGB or RGBA PNG`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      compressed.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const emptyRow = Buffer.alloc(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[row * (stride + 1)];
    const line = filtered.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const current = pixels.subarray(row * stride, (row + 1) * stride);
    const previous = row > 0 ? pixels.subarray((row - 1) * stride, row * stride) : emptyRow;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? current[index - channels] : 0;
      const upLeft = index >= channels ? previous[index - channels] : 0;
      current[index] = (line[index] + predictor(filter, left, previous[index], upLeft)) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function differingPixels(first, second, region) {
  let count = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const firstIndex = (y * first.width + x) * first.channels;
      const secondIndex = (y * second.width + x) * second.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        if (Math.abs(first.pixels[firstIndex + channel] - second.pixels[secondIndex + channel]) > channelTolerance) {
          count += 1;
          break;
        }
      }
    }
  }
  return count;
}

function parseCard(argument, margin, screen) {
  const match = /^(.+)=(\d+),(\d+),(\d+),(\d+)$/.exec(argument);
  if (!match) {
    fail(`"${argument}" is not "<card name>=<left>,<top>,<right>,<bottom>"`);
  }
  const [left, top, right, bottom] = match.slice(2).map(Number);
  return {
    name: match[1],
    bounds: { left, top, right, bottom },
    region: {
      left: Math.max(0, left - margin),
      top: Math.max(0, top - margin),
      right: Math.min(screen.width, right + margin),
      bottom: Math.min(screen.height, bottom + margin),
    },
  };
}

function joinNames(names) {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function main(argumentList) {
  const [dpPath, percentagePath, dpAgainPath, screenArgument, marginArgument, ...cardArguments] = argumentList;
  const screenMatch = /^(\d+)x(\d+)$/.exec(screenArgument ?? '');
  if (!dpPath || !percentagePath || !dpAgainPath || !screenMatch || !/^\d+$/.test(marginArgument ?? '')) {
    fail('usage: compare-shadows.mjs <dp.png> <percentage.png> <dp-again.png> <WxH> <margin px> "<card>=<l>,<t>,<r>,<b>"...');
  }
  if (cardArguments.length === 0) {
    fail('no card to compare');
  }
  let screenshots;
  try {
    screenshots = [dpPath, percentagePath, dpAgainPath].map(decodePng);
  } catch (error) {
    fail(`reading the screenshots: ${error.message}`);
  }
  const [dp, percentage, dpAgain] = screenshots;
  const [screenWidth, screenHeight] = screenMatch.slice(1).map(Number);
  if (screenshots.some((screenshot) => screenshot.width !== screenWidth || screenshot.height !== screenHeight)) {
    const sizes = screenshots.map((screenshot) => `${screenshot.width}x${screenshot.height}`).join(', ');
    fail(`the screenshots are ${sizes}, where the window the card bounds come from is ${screenWidth}x${screenHeight}`);
  }
  const cards = cardArguments.map((argument) => parseCard(argument, Number(marginArgument), dp));

  const unstable = [];
  const changed = [];
  for (const card of cards) {
    const { bounds, region } = card;
    const total = (region.right - region.left) * (region.bottom - region.top);
    const between = differingPixels(dp, dpAgain, region);
    const across = differingPixels(dp, percentage, region);
    console.log(
      `${card.name}: ${bounds.right - bounds.left}x${bounds.bottom - bounds.top} px at (${bounds.left}, ${bounds.top});` +
        ` of the ${total} pixels around it, ${between} differ between its two renders with radii in dp,` +
        ` ${across} between radii in dp and as percentages`,
    );
    if (between > 0) {
      unstable.push(card.name);
    } else if (across > 0) {
      changed.push(card.name);
    }
  }
  if (unstable.length > 0) {
    console.log(
      `SUMMARY: ${joinNames(unstable.map((name) => `the ${name}`))} rendered twice with radii in dp differs,` +
        ' so the comparison shows nothing',
    );
    process.exit(2);
  }
  if (changed.length > 0) {
    console.log(
      `SUMMARY: with radii as percentages, the elevation shadow of ${joinNames(changed.map((name) => `the ${name}`))}` +
        ' differs from the one the same radii in dp give',
    );
    process.exit(1);
  }
  console.log('SUMMARY: each card casts the same elevation shadow with its radii as percentages as with the same radii in dp');
  process.exit(0);
}

main(process.argv.slice(2));
