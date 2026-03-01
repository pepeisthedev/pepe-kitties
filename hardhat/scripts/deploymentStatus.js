const fs = require("fs");
const path = require("path");

const STATUS_DIR = path.join(__dirname, "..");
const HISTORY_DIR = path.join(STATUS_DIR, "deployment-history");

function getStatusPath(networkName) {
    return path.join(STATUS_DIR, `deployment-status-${networkName}.json`);
}

function loadDeploymentStatus(networkName) {
    const filePath = getStatusPath(networkName);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    return {
        network: null,
        lastUpdated: null,
        contracts: {},
        routers: {},
        defaultTraits: {},
        addedTraits: {},
        itemTypes: {}
    };
}

function saveDeploymentStatus(status, networkName) {
    const filePath = getStatusPath(networkName);
    const isLocalhost = networkName === "localhost" || networkName === "hardhat";

    // Archive existing file for non-localhost networks
    if (!isLocalhost && fs.existsSync(filePath)) {
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "");
        const historyPath = path.join(
            HISTORY_DIR,
            `deployment-status-${networkName}-${timestamp}.json`
        );
        fs.copyFileSync(filePath, historyPath);
        console.log(`  Archived previous status to: ${historyPath}`);
    }

    status.lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(status, null, 2));
    console.log(`  Deployment status saved to: ${filePath}`);
}

module.exports = {
    getStatusPath,
    loadDeploymentStatus,
    saveDeploymentStatus,
};
