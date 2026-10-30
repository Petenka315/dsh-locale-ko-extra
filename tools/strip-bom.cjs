// Strip a UTF-8 BOM from files (DSH parses package.json strictly).
//   node tools/strip-bom.cjs <file...>
const fs = require('fs');

for (const file of process.argv.slice(2)) {
  const buffer = fs.readFileSync(file);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    fs.writeFileSync(file, buffer.slice(3));
    console.log('stripped BOM:', file);
  } else {
    console.log('clean       :', file);
  }
}
