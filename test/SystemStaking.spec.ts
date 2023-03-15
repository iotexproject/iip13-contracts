import { ethers } from "hardhat"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish, BytesLike } from "ethers"
import { SystemStaking } from "../typechain"
import { advanceBy, duration } from "./utils"

const createBucket = async (
    system: SystemStaking,
    staker: SignerWithAddress,
    amount: BigNumberish,
    duration: BigNumberish,
    delegate: BytesLike
): Promise<BigNumber> => {
    const tx = await system.connect(staker)["stake(uint256,bytes12)"](duration, delegate, {
        value: amount,
    })
    const receipt = await tx.wait()
    return BigNumber.from(receipt.logs[1].topics[1])
}

const createBuckets = async (
    system: SystemStaking,
    staker: SignerWithAddress,
    amount: BigNumberish,
    duration: BigNumberish,
    delegate: BytesLike,
    count: BigNumberish
): Promise<BigNumber[]> => {
    const tx = await system
        .connect(staker)
        ["stake(uint256,uint256,bytes12,uint256)"](amount, duration, delegate, count, {
            value: BigNumber.from(amount).mul(count),
        })
    const receipt = await tx.wait()
    let tokenIds = []
    for (let i = 1; i < receipt.logs.length; i += 2) {
        tokenIds.push(BigNumber.from(receipt.logs[i].topics[1]))
    }
    return tokenIds
}

const createBucketsForDelegates = async (
    system: SystemStaking,
    staker: SignerWithAddress,
    amount: BigNumberish,
    duration: BigNumberish,
    delegates: BytesLike[]
): Promise<BigNumber[]> => {
    const tx = await system
        .connect(staker)
        ["stake(uint256,uint256,bytes12[])"](amount, duration, delegates, {
            value: BigNumber.from(amount).mul(delegates.length),
        })
    const receipt = await tx.wait()
    let tokenIds = []
    for (let i = 0; i < receipt.logs.length; i++) {
        tokenIds.push(BigNumber.from(receipt.logs[i].topics[1]))
    }
    return tokenIds
}

const UINT256_MAX = ethers.BigNumber.from(
    "115792089237316195423570985008687907853269984665640564039457584007913129639935"
)
const DELEGATE = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789012"))
const ONE_DAY = 86400 / 5
const ONE_ETHER = ethers.utils.parseEther("1")

const assertNotExist = async (system: SystemStaking, tokenId: BigNumberish) => {
    await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")
}

describe("SystemStaking", () => {
    let system: SystemStaking

    let owner: SignerWithAddress
    let staker: SignerWithAddress
    let alice: SignerWithAddress

    before(async () => {
        ;[owner, staker, alice] = await ethers.getSigners()
    })

    describe("owner", () => {
        beforeEach(async () => {
            const factory = await ethers.getContractFactory("SystemStaking")
            system = (await factory.deploy()) as SystemStaking
        })

        describe("pause", () => {
            it("not owner pause", async () => {
                await expect(system.connect(staker).pause()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })

            describe("success pause", () => {
                beforeEach(async () => {
                    await system.connect(owner).pause()
                })
                it("pause paused", async () => {
                    await expect(system.connect(owner).pause()).to.be.revertedWith(
                        "Pausable: paused"
                    )
                })
                it("not owner unpause", async () => {
                    await expect(system.connect(staker).unpause()).to.be.revertedWith(
                        "Ownable: caller is not the owner"
                    )
                })
                it("multiple unpause", async () => {
                    await system.connect(owner).unpause()
                    await expect(system.connect(owner).unpause()).to.be.revertedWith(
                        "Pausable: not paused"
                    )
                })
                it("functions only called when not paused", async () => {
                    await expect(
                        createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(
                        createBuckets(system, staker, ONE_ETHER, ONE_DAY, DELEGATE, 2)
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(
                        createBucketsForDelegates(system, staker, ONE_ETHER, ONE_DAY, [DELEGATE])
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(system.lock(1, ONE_DAY)).to.be.revertedWith("Pausable: paused")
                    await expect(system.unlock(1)).to.be.revertedWith("Pausable: paused")
                    await expect(system.unstake(1)).to.be.revertedWith("Pausable: paused")
                    await expect(system.withdraw(1, staker.address)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system.extendDuration(1, ONE_DAY)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system.increaseAmount(1, ONE_ETHER)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system.changeDelegate(1, DELEGATE)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system.changeDelegates([1], DELEGATE)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                })
            })
        })

        describe("emergency withdraw panalty rate", () => {
            it("not owner set", async () => {
                await expect(
                    system.connect(staker).setEmergencyWithdrawPenaltyRate(90)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("invalid penalty rate", async () => {
                await expect(
                    system.connect(owner).setEmergencyWithdrawPenaltyRate(110)
                ).to.be.revertedWith("invaid penalty rate")
            })

            it("not owner read", async () => {
                await system.connect(owner).setEmergencyWithdrawPenaltyRate(80)
                await expect(await system.connect(staker).emergencyWithdrawPenaltyRate()).to.equal(
                    80
                )
            })
        })

        describe("bucket type", () => {
            let system2: SystemStaking

            beforeEach(async () => {
                const factory = await ethers.getContractFactory("SystemStaking")
                system2 = (await factory.deploy()) as SystemStaking
            })

            it("not owner add", async () => {
                await expect(
                    system2.connect(staker).addBucketType(100, ONE_DAY)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("add zero amount", async () => {
                await expect(system2.connect(owner).addBucketType(0, ONE_DAY)).to.be.revertedWith(
                    "amount is invalid"
                )
            })

            it("add success", async () => {
                await system2.connect(owner).addBucketType(10, ONE_DAY)
                await expect(await system2.connect(owner).isActiveBucketType(10, ONE_DAY)).to.equal(
                    true
                )
                await expect(await system2.connect(owner).numOfBucketTypes()).to.equal(1)
                let types = await system2.connect(owner).bucketTypes(0, 1)
                expect(types.length).to.equal(1)
                expect(types[0].amount).to.equal(10)
                expect(types[0].duration).to.equal(ONE_DAY)
                expect(types[0].activatedAt).to.equal(await ethers.provider.getBlockNumber())
            })

            it("add duplicate", async () => {
                await system2.connect(owner).addBucketType(10, ONE_DAY)
                await expect(system2.connect(owner).addBucketType(10, ONE_DAY)).to.be.revertedWith(
                    "duplicate bucket type"
                )
            })

            it("add multiple", async () => {
                await system2.connect(owner).addBucketType(10, ONE_DAY)
                await system2.connect(owner).addBucketType(20, ONE_DAY)
                await system2.connect(owner).addBucketType(30, ONE_DAY)
                expect(await system2.connect(owner).numOfBucketTypes()).to.equal(3)
            })

            it("not owner deactivate", async () => {
                await system2.connect(owner).addBucketType(100, ONE_DAY)
                await expect(
                    system2.connect(staker).deactivateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("deactivate invalid", async () => {
                await expect(
                    system2.connect(owner).deactivateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("invalid bucket type")
            })

            it("deactivate success", async () => {
                await system2.connect(owner).addBucketType(100, ONE_DAY)
                await system2.connect(owner).deactivateBucketType(100, ONE_DAY)
                await expect(
                    await system2.connect(owner).isActiveBucketType(100, ONE_DAY)
                ).to.equal(false)
            })

            it("not owner activate", async () => {
                await system2.connect(owner).addBucketType(100, ONE_DAY)
                await system2.connect(owner).deactivateBucketType(100, ONE_DAY)
                await expect(
                    system2.connect(staker).activateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("activate invalid", async () => {
                await expect(
                    system2.connect(owner).activateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("invalid bucket type")
            })

            it("activate success", async () => {
                await system2.connect(owner).addBucketType(100, ONE_DAY)
                await system2.connect(owner).deactivateBucketType(100, ONE_DAY)
                await system2.connect(owner).activateBucketType(100, ONE_DAY)
                await expect(
                    await system2.connect(owner).isActiveBucketType(100, ONE_DAY)
                ).to.equal(true)
            })
        })

        describe("withdraw fee", () => {
            it("not owner", async () => {
                await expect(
                    system.connect(staker).withdrawFee(0, staker.address)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("invalid amount", async () => {
                await expect(
                    system.connect(owner).withdrawFee(100, staker.address)
                ).to.be.revertedWith("invalid amount")
            })

            it("success", async () => {
                await system.connect(owner).setEmergencyWithdrawPenaltyRate(10)
                await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY)
                let tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
                await system.connect(staker).emergencyWithdraw(tokenId, staker.address)
                expect(await system.connect(staker).accumulatedWithdrawFee()).to.equal(
                    ONE_ETHER.div(10)
                )
                let oldBalance = await alice.getBalance()
                await system.connect(owner).withdrawFee(5, alice.address)
                expect(await alice.getBalance()).to.equal(ethers.BigNumber.from(5).add(oldBalance))
                expect(await system.connect(owner).accumulatedWithdrawFee()).to.equal(
                    ONE_ETHER.div(10).sub(5)
                )
            })
        })
    })

    describe("stake flow", () => {
        beforeEach(async () => {
            const factory = await ethers.getContractFactory("SystemStaking")
            system = (await factory.deploy()) as SystemStaking
            await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY)
        })

        it("check basic setup info", async () => {
            expect(1).to.equal(await system.numOfBucketTypes())
        })

        describe("create bucket", () => {
            it("should revert with invalid data", async () => {
                await expect(
                    createBucket(system, staker, ONE_ETHER, ONE_DAY + 1, DELEGATE)
                ).to.be.revertedWith("invalid bucket type")

                await expect(
                    createBucket(system, staker, ONE_ETHER + 1, ONE_DAY + 1, DELEGATE)
                ).to.be.revertedWith("invalid bucket type")
            })

            describe("valid bucket type", () => {
                it("should succeed for activated", async () => {
                    const tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)

                    expect(staker.address).to.equal(await system.ownerOf(tokenId))
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount_).to.equal(ONE_ETHER)
                    expect(bucket.duration_).to.equal(ONE_DAY)
                    expect(bucket.delegate_).to.equal(DELEGATE)
                    expect(bucket.unlockedAt_).to.equal(UINT256_MAX)
                    expect(bucket.unstakedAt_).to.equal(UINT256_MAX)
                })
                it("should revert with deactivated", async () => {
                    await system.connect(owner).deactivateBucketType(ONE_ETHER, ONE_DAY)
                    await expect(
                        createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
                    ).to.be.revertedWith("not active bucket type")
                    await system.connect(owner).activateBucketType(ONE_ETHER, ONE_DAY)
                })
            })
        })

        describe("emergency withdraw", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
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
            it("succeed emergency withdraw deactivated bucket type", async () => {
                await system.connect(owner).deactivateBucketType(ONE_ETHER, ONE_DAY)
                await expect(
                    system.connect(staker).emergencyWithdraw(tokenId, alice.address)
                ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
                await system.connect(owner).activateBucketType(ONE_ETHER, ONE_DAY)
                await assertNotExist(system, tokenId)
            })
            it("should revert for repeatedly withdraw", async () => {
                await expect(
                    system.connect(staker).emergencyWithdraw(tokenId, alice.address)
                ).to.changeEtherBalance(alice.address, ethers.utils.parseEther("0.1"))
                await expect(
                    system.connect(staker).emergencyWithdraw(tokenId, alice.address)
                ).to.be.revertedWith("invalid token")
                await assertNotExist(system, tokenId)
            })
        })

        describe("normal withdraw", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
                await system.connect(owner).setEmergencyWithdrawPenaltyRate(90)
                await system.connect(staker).transferFrom(staker.address, alice.address, tokenId)
            })
            it("not unstakable", async () => {
                await expect(system.connect(alice).blocksToUnstake(tokenId)).to.be.revertedWith(
                    "not an unlocked bucket"
                )
            })
            describe("unlock", () => {
                beforeEach(async () => {
                    await system.connect(alice).unlock(tokenId)
                    expect(ONE_DAY).to.be.equal(
                        await system.connect(alice).blocksToUnstake(tokenId)
                    )
                })
                it("failed to unlock again", async () => {
                    await expect(system.connect(alice).unlock(tokenId)).to.be.revertedWith(
                        "not a locked token"
                    )
                })
                it("lock & unlock", async () => {
                    await system.connect(alice).lock(tokenId, ONE_DAY)
                    await expect(system.connect(alice).blocksToUnstake(tokenId)).to.be.revertedWith(
                        "not an unlocked bucket"
                    )
                    await system.connect(alice).unlock(tokenId)
                    expect(ONE_DAY).to.be.equal(
                        await system.connect(alice).blocksToUnstake(tokenId)
                    )
                })
                describe("unstake", () => {
                    beforeEach(async () => {
                        await advanceBy(BigNumber.from(ONE_DAY))
                        await system.connect(alice).unstake(tokenId)
                    })
                    it("unstaked bucket not transaferable", async () => {
                        await expect(
                            system
                                .connect(alice)
                                .transferFrom(alice.address, staker.address, tokenId)
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
                            ).to.changeEtherBalance(staker.address, ONE_ETHER)
                            await assertNotExist(system, tokenId)
                        })
                    })
                })
            })
        })

        describe("votes", () => {
            it("locked votes", async () => {
                let delegate = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789013"))
                await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegate)
                expect((await system.connect(staker).lockedVotesTo([delegate]))[0][0]).to.equal(1)
            })

            it("unlocked votes", async () => {
                let delegate = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789013"))
                let tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegate)
                await system.connect(staker).unlock(tokenId)
                expect((await system.connect(staker).unlockedVotesTo([delegate]))[0][0]).to.equal(1)
            })

            describe("multiple delegates", () => {
                const delegates = [
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789014")),
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789015")),
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789016")),
                ]
                const bucketNum = [3, 2, 4]
                it("create one by one", async () => {
                    for (let i = 0; i < bucketNum.length; i++) {
                        for (let j = 0; j < bucketNum[i]; j++) {
                            await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegates[i])
                        }
                    }
                })
                it("create by delegate in batch", async () => {
                    for (let i = 0; i < bucketNum.length; i++) {
                        await createBuckets(
                            system,
                            staker,
                            ONE_ETHER,
                            ONE_DAY,
                            delegates[i],
                            bucketNum[i]
                        )
                    }
                })
                it("create all in batch", async () => {
                    let list = []
                    for (let i = 0; i < bucketNum.length; i++) {
                        for (let j = 0; j < bucketNum[i]; j++) {
                            list.push(delegates[i])
                        }
                    }
                    await createBucketsForDelegates(system, staker, ONE_ETHER, ONE_DAY, list)
                })
                afterEach(async () => {
                    const votes = await system.connect(staker).lockedVotesTo(delegates)
                    for (let i = 0; i < bucketNum.length; i++) {
                        expect(votes[i][0]).to.equal(bucketNum[i])
                    }
                })
            })

            it("after increase amount", async () => {
                let delegate = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789013"))
                let tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegate)
                await system.connect(owner).addBucketType(ONE_ETHER.mul(2), ONE_DAY)
                await system
                    .connect(staker)
                    .increaseAmount(tokenId, ONE_ETHER.mul(2), { value: ONE_ETHER })
                expect((await system.connect(staker).lockedVotesTo([delegate]))[0][0]).to.equal(0)
                expect((await system.connect(staker).lockedVotesTo([delegate]))[0][1]).to.equal(1)
            })

            it("after change delegate", async () => {
                let delegates = [
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789018")),
                    ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789019")),
                ]
                let tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegates[0])
                await system.connect(staker).changeDelegate(tokenId, delegates[1])
                let votes = await system.connect(staker).lockedVotesTo(delegates)
                expect(votes[0][0]).to.equal(0)
                expect(votes[1][0]).to.equal(1)
            })
        })

        describe("extend duration", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).extendDuration(tokenId, ONE_DAY * 2)
                ).to.be.revertedWith("not owner")
            })

            it("token unlocked", async () => {
                await system.connect(staker).unlock(tokenId)
                await expect(
                    system.connect(staker).extendDuration(tokenId, ONE_DAY * 2)
                ).to.be.revertedWith("not a locked token")
            })

            it("shorter duration", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY * 0.5)
                await expect(
                    system.connect(staker).extendDuration(tokenId, ONE_DAY * 0.5)
                ).to.be.revertedWith("invalid operation")
            })

            it("not existed bucket type", async () => {
                await expect(
                    system.connect(staker).extendDuration(tokenId, ONE_DAY * 2)
                ).to.be.revertedWith("invalid bucket type")
            })

            it("deactivated bucket type", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY * 2)
                await system.connect(owner).deactivateBucketType(ONE_ETHER, ONE_DAY * 2)
                await expect(
                    system.connect(staker).extendDuration(tokenId, ONE_DAY * 2)
                ).to.be.revertedWith("inactive bucket type")
            })

            it("success", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY * 2)
                await system.connect(staker).extendDuration(tokenId, ONE_DAY * 2)
                let bucket = await system.bucketOf(tokenId)
                expect(bucket.duration_).to.equal(ONE_DAY * 2)
            })

            it("blocks to unstake", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY * 2)
                await system.connect(staker).unlock(tokenId)
                await advanceBy(BigNumber.from(ONE_DAY))
                expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(0)

                await system.connect(staker).lock(tokenId, ONE_DAY)
                await system.connect(staker).extendDuration(tokenId, ONE_DAY * 2)
                await system.connect(staker).unlock(tokenId)
                expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(ONE_DAY * 2)
            })
        })

        describe("increase amount", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).increaseAmount(tokenId, ONE_ETHER.mul(2))
                ).to.be.revertedWith("not owner")
            })

            it("token unlocked", async () => {
                await system.connect(staker).unlock(tokenId)
                await expect(
                    system.connect(staker).increaseAmount(tokenId, ONE_ETHER.mul(2))
                ).to.be.revertedWith("not a locked token")
            })

            it("invalid amount", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER.mul(2), ONE_DAY)
                await expect(
                    system
                        .connect(staker)
                        .increaseAmount(tokenId, ONE_ETHER.mul(2), { value: ONE_ETHER.mul(0) })
                ).to.be.revertedWith("invalid operation")
            })

            it("not existed bucket type", async () => {
                await expect(
                    system
                        .connect(staker)
                        .increaseAmount(tokenId, ONE_ETHER.mul(2), { value: ONE_ETHER })
                ).to.be.revertedWith("invalid bucket type")
            })

            it("deactivated bucket type", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER.mul(2), ONE_DAY)
                await system.connect(owner).deactivateBucketType(ONE_ETHER.mul(2), ONE_DAY)
                await expect(
                    system
                        .connect(staker)
                        .increaseAmount(tokenId, ONE_ETHER.mul(2), { value: ONE_ETHER })
                ).to.be.revertedWith("inactive bucket type")
            })

            it("success", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER.mul(2), ONE_DAY)
                await system
                    .connect(staker)
                    .increaseAmount(tokenId, ONE_ETHER.mul(2), { value: ONE_ETHER })
                let bucket = await system.bucketOf(tokenId)
                expect(bucket.amount_).to.equal(ONE_ETHER.mul(2))
            })
        })

        describe("change delegate", () => {
            let tokenId: BigNumber
            let delegate2: string
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATE)
                delegate2 = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789014"))
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).changeDelegate(tokenId, delegate2)
                ).to.be.revertedWith("not owner")
            })

            it("locked", async () => {
                await system.connect(staker).changeDelegate(tokenId, delegate2)
                let bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate_).to.equal(delegate2)
            })

            it("unlocked", async () => {
                await system.connect(staker).unlock(tokenId)
                await system.connect(staker).changeDelegate(tokenId, delegate2)
                let bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate_).to.equal(delegate2)
            })

            it("unstaked", async () => {
                await system.connect(staker).unlock(tokenId)
                await advanceBy(BigNumber.from(ONE_DAY))
                await system.connect(staker).unstake(tokenId)
                await expect(
                    system.connect(staker).changeDelegate(tokenId, delegate2)
                ).to.be.revertedWith("not a staked token")
            })
        })

        describe("batch change delegates", () => {
            let tokenIds: BigNumber[]
            let delegate2: string
            beforeEach(async () => {
                tokenIds = await createBuckets(system, staker, ONE_ETHER, ONE_DAY, DELEGATE, 4)
                delegate2 = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("123456789014"))
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).changeDelegates(tokenIds, delegate2)
                ).to.be.revertedWith("not owner")
            })

            it("success", async () => {
                await system.connect(staker).changeDelegates(tokenIds, delegate2)
                for (let i = 0; i < tokenIds.length; i++) {
                    let bucket = await system.bucketOf(tokenIds[i])
                    expect(bucket.delegate_).to.equal(delegate2)
                }
            })
        })
    })
})
