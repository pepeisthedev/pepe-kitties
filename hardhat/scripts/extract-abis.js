const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "contracts");
const WEBSITE_ABI_DIR = path.join(ROOT, "..", "website", "src", "assets", "abis");

const ABI_TARGETS = [
    "Fregs",
    "FregsItems",
    "FregsMintPass",
    "FregsRandomizer",
    "FregsSVGRenderer",
    "SpinTheWheel",
    "FregCoin",
    "FregsLiquidity",
    "FregShop",
];

function copyAbi(contractName) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${contractName}.sol`, `${contractName}.json`);
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Missing artifact: ${artifactPath}`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const targetPath = path.join(WEBSITE_ABI_DIR, `${contractName}.json`);
    fs.writeFileSync(targetPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`Copied ${contractName} ABI`);
}

function main() {
    fs.mkdirSync(WEBSITE_ABI_DIR, { recursive: true });

    for (const contractName of ABI_TARGETS) {
        copyAbi(contractName);
    }
}

main();
