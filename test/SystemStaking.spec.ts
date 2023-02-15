import { ethers } from "hardhat"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { SystemStaking } from "../typechain"

describe("SystemStaking", () => {
    let system: SystemStaking

    let owner: SignerWithAddress
    let staker: SignerWithAddress

    const ONE_DAY = 86400

    before(async () => {
        ;[owner, staker] = await ethers.getSigners()

        const factory = await ethers.getContractFactory("SystemStaking")
        system = (await factory.deploy()) as SystemStaking
    })

    describe("staking", () => {
        before(async () => {
            await system.connect(owner).addBucketType(ethers.utils.parseEther("1"), ONE_DAY)
        })

        it("check basic setup info", async () => {
            expect(1).to.equal(await system.numOfBucketTypes())
        })

        it("should succeed for with correct data", async () => {
            await system
                .connect(staker)
                .stake(ONE_DAY, ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012")), {
                    value: ethers.utils.parseEther("1"),
                })

            expect(staker.address).to.equal(await system.ownerOf(1))
        })
    })
})
