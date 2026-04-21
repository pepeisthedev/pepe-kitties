const readline = require("readline");
const { HDNodeWallet, Mnemonic } = require("ethers");

const DEFAULT_DERIVATION_PREFIX = "m/44'/60'/0'/0";
const DEFAULT_COUNT = 4;

function parseCount(rawValue) {
    const value = Number(rawValue ?? DEFAULT_COUNT);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid count: ${rawValue}`);
    }
    return value;
}

async function promptHidden(query) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });

        rl.question(query, (answer) => {
            rl.close();
            process.stdout.write("\n");
            resolve(answer.trim());
        });

        rl._writeToOutput = function writeMaskedOutput(text) {
            if (rl.stdoutMuted) {
                rl.output.write("*");
                return;
            }
            rl.output.write(text);
        };

        rl.stdoutMuted = true;
    });
}

async function getMnemonic() {
    if (process.env.MNEMONIC && process.env.MNEMONIC.trim()) {
        return process.env.MNEMONIC.trim();
    }

    if (!process.stdin.isTTY) {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        const piped = Buffer.concat(chunks).toString("utf8").trim();
        if (piped) {
            return piped;
        }
    }

    return promptHidden("Enter seed phrase: ");
}

async function main() {
    const count = parseCount(process.argv[2]);
    const derivationPrefix = process.env.DERIVATION_PREFIX || DEFAULT_DERIVATION_PREFIX;
    const phrase = await getMnemonic();

    if (!phrase) {
        throw new Error("Mnemonic is required.");
    }

    const mnemonic = Mnemonic.fromPhrase(phrase);

    console.log(`Derivation prefix: ${derivationPrefix}`);
    console.log(`Accounts: ${count}`);
    console.log("");

    for (let index = 0; index < count; index += 1) {
        const path = `${derivationPrefix}/${index}`;
        const wallet = HDNodeWallet.fromMnemonic(mnemonic, path);
        console.log(`[${index}] ${path}`);
        console.log(`Address:     ${wallet.address}`);
        console.log(`Private key: ${wallet.privateKey}`);
        console.log("");
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
