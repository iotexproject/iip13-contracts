# Implementation of iip-13 contract
The SystemStaking NFT contract implements the IIP-13 Proposal. For each staking bucket creation, the contract issues an NFT token corresponding to one of the supported pre-set bucket types. The owner address of the NFT token will receive the IOTX rewards and is the sole account eligible to perform staking actions on the bucket, such as changing the voted delegate, unstaking, or withdrawing the deposit. Transferring the NFT token to a different wallet address also transfers bucket ownership, along with all future rewards and the eligibility to unstake and withdraw. Buckets created within this contract are accounted for in the staking protocol of the IoTeX blockchain. For more details, please refer to the code.

[Go to the original IIP13 Proposal ->](https://github.com/iotexproject/iips/blob/master/iip-13.md)

# Commands
lint: `yarn lint:fix`
test: `npx hardhat test`

# Audits
- SlowMist: https://github.com/slowmist/Knowledge-Base/blob/master/open-report-V2/smart-contract/SlowMist%20Audit%20Report%20-%20IoTeX%20-%20SystemStaking_en-us.pdf
