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

const assertNotExist = async (system: SystemStaking, tokenId: BigNumberish) => {
    await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")
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

    describe("flow", () => {
        before(async () => {
            await system.connect(owner).addBucketTypes(ethers.utils.parseEther("1"), ONE_DAY)
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

        describe("emergency withdraw", () => {
            let tokenId: BigNumber;
            beforeEach(async () => {
                tokenId = await createBucket(
                    system,
                    staker,
                    ONE_DAY,
                    ethers.utils.parseEther("1"),
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012"))
                )
                await system.connect(owner).setEmergencyWithdrawPenaltyRate(90)
            })
            it("succeed emergency withdraw locked bucket", async () => {
                await expect(
                    system.connect(staker).emergencyWithdraw(tokenId, alice.address)
                ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
                await assertNotExist(system, tokenId)
            })
            it("succeed emergency withdraw unlocked bucket", async () => {
                await system.connect(staker).unlock(tokenId)
                await expect(
                    system.connect(staker).emergencyWithdraw(tokenId, alice.address)
                ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
                await assertNotExist(system, tokenId)
            })
            it("succeed emergency withdraw unstaked bucket", async () => {
                await system.connect(staker).unlock(tokenId)
                await advanceBy(BigNumber.from(ONE_DAY))
                await system.connect(staker).unstake(tokenId)
                await expect(
                    system.connect(staker).emergencyWithdraw(tokenId, alice.address)
                ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
                await assertNotExist(system, tokenId)
            })
        })

        describe("normal withdraw", () => {
            let tokenId: BigNumber;
            beforeEach(async () => {
                tokenId = await createBucket(
                    system,
                    staker,
                    ONE_DAY,
                    ethers.utils.parseEther("1"),
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012"))
                )
                await system.connect(owner).setEmergencyWithdrawPenaltyRate(90)
                await system.connect(staker).transferFrom(staker.address, alice.address, tokenId)
            })
            it("not unstakable", async () => {
                await expect(
                    system.connect(alice).blocksToUnstake(tokenId)
                ).to.be.revertedWith("not an unlocked bucket")
            })
            describe("unlock", () => {
                beforeEach(async () => {
                    await system.connect(alice).unlock(tokenId)
                    expect(ONE_DAY).to.be.equal(await system.connect(alice).blocksToUnstake(tokenId))
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(alice).unstake(tokenId)
                })
                it("unstaked bucket not transaferable", async () => {
                    await expect(
                        system.connect(alice).transferFrom(alice.address, staker.address, tokenId)
                    ).to.be.revertedWith("cannot transfer unstaked bucket")
                })
                it("not withdrawable", async () => {
                    await expect(
                        system.connect(alice).withdraw(tokenId, alice.address)
                    ).to.be.revertedWith("not ready to withdraw")
                })
                describe("withdraw", () => {
                    beforeEach(async () => {
                        expect(3 * ONE_DAY).to.be.equal(await system.blocksToWithdraw(tokenId))
                        await advanceBy(BigNumber.from(3 * ONE_DAY))
                        expect(0).to.be.equal(await system.blocksToWithdraw(tokenId))
                    })
                    it("not owner", async () => {
                        await expect(
                            system.connect(staker).withdraw(tokenId, alice.address)
                        ).to.be.revertedWith("not owner")
                    })
                    it("succeed withdraw", async () => {
                        await expect(
                            await system.connect(alice).withdraw(tokenId, staker.address)
                        ).to.changeEtherBalance(staker.address, ethers.utils.parseEther("1"))
                        await assertNotExist(system, tokenId)
                    })
                })
            })
        })
    })
})
