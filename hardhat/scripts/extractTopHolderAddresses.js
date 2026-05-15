const fs = require("fs");
const path = require("path");

const networkArg = process.argv[2] || "base";
const inputPath = path.join(__dirname, "..", `top-holders-${networkArg}.json`);
const outputPath = path.join(__dirname, "..", `top-holders-${networkArg}.txt`);

if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const addresses = (data.topHolders || []).map(h => h.address);

fs.writeFileSync(outputPath, addresses.join("\n") + "\n");

console.log(addresses.join("\n"));
console.log(`\nWrote ${addresses.length} addresses to: ${outputPath}`);
