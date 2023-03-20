import * as dotenv from "dotenv"
import type { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import "solidity-coverage"
import "hardhat-gas-reporter"

dotenv.config()

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.17",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 10000,
                    },
                },
            },
        ],
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
        outputFile: "gas-report.txt",
        noColors: true,
    },
    paths: {
        sources: "./src", // Use ./src rather than ./contracts as Hardhat expects
        cache: "./cache_hardhat", // Use a different cache for Hardhat than Foundry
    },
    mocha: {
        timeout: 200000, // 200 seconds max for running tests
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5",
    },
}

export default config
