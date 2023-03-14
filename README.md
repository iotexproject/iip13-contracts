# Implementation of iip-13 contract
SystemStaking is the contract implemented for iip-13. It issues an NFT token for each bucket creation. Owner of the NFT token could update/transfer/unstake the corresponding bucket. The buckets created in this contract will be counted in the staking procotol in iotex-core. For more details, please refer to the code.

# Commands
lint: `yarn lint:fix`
test: `npx hardhat test`