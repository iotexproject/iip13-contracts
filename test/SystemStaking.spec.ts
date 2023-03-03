import { ethers } from "hardhat"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish, BytesLike } from "ethers"
import { SystemStaking } from "../typechain"
import { advanceBy, duration } from "./utils"

const createBucket = async (
    system: SystemStaking,
    staker: SignerWithAddress,
    duration: BigNumberish,
    amount: BigNumberish,
    delegate: BytesLike
): Promise<BigNumber> => {
    const tx = await system.connect(staker)["stake(uint256,bytes12)"](duration, delegate, {
        value: amount,
    })
    const receipt = await tx.wait()
    return BigNumber.from(receipt.logs[1].topics[1])
}

describe("SystemStaking", () => {
    let system: SystemStaking

    let owner: SignerWithAddress
    let staker: SignerWithAddress
    let alice: SignerWithAddress

    const ONE_DAY = 86400 / 5

    before(async () => {
        ;[owner, staker, alice] = await ethers.getSigners()

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

        it("should revert with invalid data", async () => {
            await expect(
                system
                    .connect(staker)
                    ["stake(uint256,bytes12)"](
                        ONE_DAY + 1,
                        ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012")),
                        {
                            value: ethers.utils.parseEther("1"),
                        }
                    )
            ).to.be.revertedWith("invalid bucket type")

            await expect(
                system
                    .connect(staker)
                    ["stake(uint256,bytes12)"](
                        ONE_DAY + 1,
                        ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012")),
                        {
                            value: ethers.utils.parseEther("1.1"),
                        }
                    )
            ).to.be.revertedWith("invalid bucket type")
        })

        it("should succeed for with correct data", async () => {
            await system
                .connect(staker)
                ["stake(uint256,bytes12)"](
                    ONE_DAY,
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012")),
                    {
                        value: ethers.utils.parseEther("1"),
                    }
                )

            expect(staker.address).to.equal(await system.ownerOf(1))
        })

        it("should succeed emergency withdraw", async () => {
            await system.connect(owner).setEmergencyWithdrawPenaltyRate(90)

            let tokenId = await createBucket(
                system,
                staker,
                ONE_DAY,
                ethers.utils.parseEther("1"),
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012"))
            )

            await expect(
                system.connect(staker).emergencyWithdraw(tokenId, alice.address)
            ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
            await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")

            tokenId = await createBucket(
                system,
                staker,
                ONE_DAY,
                ethers.utils.parseEther("1"),
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012"))
            )
            await system.connect(staker).unstake(tokenId)
            await expect(
                system.connect(staker).emergencyWithdraw(tokenId, alice.address)
            ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
            await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")
        })

        it("should succeed with unstake", async () => {
            const tokenId = await createBucket(
                system,
                staker,
                ONE_DAY,
                ethers.utils.parseEther("1"),
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012"))
            )

            await system.connect(staker).transferFrom(staker.address, alice.address, tokenId)
            await system.connect(alice).unstake(tokenId)

            await expect(
                system.connect(alice).transferFrom(alice.address, staker.address, tokenId)
            ).to.be.revertedWith("cannot transfer unstaked bucket")

            await expect(system.connect(alice).withdraw(tokenId, alice.address)).to.be.revertedWith(
                "not ready to withdraw"
            )

            expect(await system.readyToWithdraw(tokenId)).to.false
            await advanceBy(BigNumber.from(ONE_DAY))
            expect(await system.readyToWithdraw(tokenId)).to.true

            await expect(
                system.connect(staker).withdraw(tokenId, alice.address)
            ).to.be.revertedWith("not owner")

            await expect(
                await system.connect(alice).withdraw(tokenId, staker.address)
            ).to.changeEtherBalance(staker.address, ethers.utils.parseEther("1"))

            await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")
        })
    })
})
