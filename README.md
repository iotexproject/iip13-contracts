# Implementation of iip-13 contract
SystemStaking is the contract implemented for iip-13. It issues an NFT token for each bucket creation. Owner of the NFT token could update/transfer/unstake the corresponding bucket. The buckets created in this contract will be counted in the staking procotol in iotex-core. For more details, please refer to the code.

## Commands
- lint: `yarn lint:fix`
- test: `npx hardhat test`

## Deployments

### Mainnet

- Contract address: `0x68db92a6a78a39dcaff1745da9e89e230ef49d3d`

Supported bucket types include: 

| Bucket Amount  | Duration (days) | Duration (blocks) |
| -------------- | --------------- | ----------------- |
| 10,000 IOTX    | 91              | 1572480           |
| 100,000 IOTX   | 91              | 1572480           |
| 1,000,000 IOTX | 91              | 1572480           |


### Testnet

- Contract address: `0x52ab0fe2c3a94644de0888a3ba9ea1443672e61f`

Supported bucket types include: 

| Bucket Amount | Duration (days) | Duration (blocks) |
| ------------- | --------------- | ----------------- |
| 100 IOTX      | 2               | 34560             |
| 1000 IOTX     | 2               | 34560             |
| 10,000 IOTX   | 2               | 34560             |

> The supported bucket types in the testnet deployment may be updated frequently. Please call `bucketTypes` and `numOfBucketTypes` functions for the latest information.
