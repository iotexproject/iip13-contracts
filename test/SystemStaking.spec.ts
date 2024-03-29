import { ethers } from "hardhat"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish, BytesLike } from "ethers"
import { SystemStaking } from "../typechain"
import { advanceBy, duration } from "./utils"
import { assert } from "console"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { token } from "../typechain/@openzeppelin/contracts"

const createBucket = async (
    system: SystemStaking,
    staker: SignerWithAddress,
    amount: BigNumberish,
    duration: BigNumberish,
    delegate: string
): Promise<BigNumber> => {
    const tx = await system.connect(staker)["stake(uint256,address)"](duration, delegate, {
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
    delegate: string,
    count: BigNumberish
): Promise<BigNumber[]> => {
    const tx = await system
        .connect(staker)
        ["stake(uint256,uint256,address,uint256)"](amount, duration, delegate, count, {
            value: BigNumber.from(amount).mul(count),
        })
    const receipt = await tx.wait()
    const tokenIds = []
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
    delegates: string[]
): Promise<BigNumber[]> => {
    const tx = await system
        .connect(staker)
        ["stake(uint256,uint256,address[])"](amount, duration, delegates, {
            value: BigNumber.from(amount).mul(delegates.length),
        })
    const receipt = await tx.wait()
    const tokenIds = []
    for (let i = 0; i < receipt.logs.length; i++) {
        tokenIds.push(BigNumber.from(receipt.logs[i].topics[1]))
    }
    return tokenIds
}

const UINT256_MAX = ethers.BigNumber.from(
    "115792089237316195423570985008687907853269984665640564039457584007913129639935"
)
const DELEGATES = [
    ethers.Wallet.createRandom().address,
    ethers.Wallet.createRandom().address,
    ethers.Wallet.createRandom().address,
]

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
                        createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(
                        createBuckets(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0], 2)
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(
                        createBucketsForDelegates(system, staker, ONE_ETHER, ONE_DAY, [
                            DELEGATES[0],
                        ])
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(system["lock(uint256,uint256)"](1, ONE_DAY)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system["unlock(uint256)"](1)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system["unstake(uint256)"](1)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(
                        system["withdraw(uint256,address)"](1, staker.address)
                    ).to.be.revertedWith("Pausable: paused")
                    await expect(system.expandBucket(1, ONE_ETHER, ONE_DAY)).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system.changeDelegate(1, DELEGATES[0])).to.be.revertedWith(
                        "Pausable: paused"
                    )
                    await expect(system.changeDelegates([1], DELEGATES[0])).to.be.revertedWith(
                        "Pausable: paused"
                    )
                })
            })
        })

        describe("bucket type", () => {
            it("not owner add", async () => {
                await expect(system.connect(staker).addBucketType(100, ONE_DAY)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })

            it("add zero amount", async () => {
                await expect(system.connect(owner).addBucketType(0, ONE_DAY)).to.be.revertedWith(
                    "amount is invalid"
                )
            })

            it("add success", async () => {
                await expect(system.connect(owner).addBucketType(10, ONE_DAY))
                    .to.emit(system.connect(owner), "BucketTypeActivated")
                    .withArgs(10, ONE_DAY)
                await expect(await system.connect(owner).isActiveBucketType(10, ONE_DAY)).to.equal(
                    true
                )
                await expect(await system.connect(owner).numOfBucketTypes()).to.equal(1)
                await expect(system.bucketTypes(1, 1)).to.be.revertedWith("invalid parameters")
                const types = await system.connect(owner).bucketTypes(0, 1)
                expect(types.length).to.equal(1)
                expect(types[0].amount).to.equal(10)
                expect(types[0].duration).to.equal(ONE_DAY)
                expect(types[0].activatedAt).to.equal(await ethers.provider.getBlockNumber())
            })

            it("add duplicate", async () => {
                await system.connect(owner).addBucketType(10, ONE_DAY)
                await expect(system.connect(owner).addBucketType(10, ONE_DAY)).to.be.revertedWith(
                    "duplicate bucket type"
                )
            })

            it("add multiple", async () => {
                await system.connect(owner).addBucketType(10, ONE_DAY)
                await system.connect(owner).addBucketType(20, ONE_DAY)
                await system.connect(owner).addBucketType(30, ONE_DAY)
                expect(await system.connect(owner).numOfBucketTypes()).to.equal(3)
            })

            it("not owner deactivate", async () => {
                await system.connect(owner).addBucketType(100, ONE_DAY)
                await expect(
                    system.connect(staker).deactivateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("deactivate invalid", async () => {
                await expect(
                    system.connect(owner).deactivateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("invalid bucket type")
            })

            it("deactivate success", async () => {
                await system.connect(owner).addBucketType(100, ONE_DAY)
                await expect(system.connect(owner).deactivateBucketType(100, ONE_DAY))
                    .to.emit(system.connect(owner), "BucketTypeDeactivated")
                    .withArgs(100, ONE_DAY)
                await expect(await system.connect(owner).isActiveBucketType(100, ONE_DAY)).to.equal(
                    false
                )
            })

            it("not owner activate", async () => {
                await system.connect(owner).addBucketType(100, ONE_DAY)
                await system.connect(owner).deactivateBucketType(100, ONE_DAY)
                await expect(
                    system.connect(staker).activateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })

            it("activate invalid", async () => {
                await expect(
                    system.connect(owner).activateBucketType(100, ONE_DAY)
                ).to.be.revertedWith("invalid bucket type")
            })

            it("activate success", async () => {
                await system.connect(owner).addBucketType(100, ONE_DAY)
                await system.connect(owner).deactivateBucketType(100, ONE_DAY)
                await expect(system.connect(owner).activateBucketType(100, ONE_DAY))
                    .to.emit(system.connect(owner), "BucketTypeActivated")
                    .withArgs(100, ONE_DAY)
                await expect(await system.connect(owner).isActiveBucketType(100, ONE_DAY)).to.equal(
                    true
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
                    createBucket(system, staker, ONE_ETHER, ONE_DAY + 1, DELEGATES[0])
                ).to.be.revertedWith("invalid bucket type")

                await expect(
                    createBucket(system, staker, ONE_ETHER + 1, ONE_DAY + 1, DELEGATES[0])
                ).to.be.revertedWith("invalid bucket type")
            })

            describe("valid bucket type", () => {
                it("should succeed for activated", async () => {
                    const tokenId = await createBucket(
                        system,
                        staker,
                        ONE_ETHER,
                        ONE_DAY,
                        DELEGATES[0]
                    )
                    expect(staker.address).to.equal(await system.ownerOf(tokenId))
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount_).to.equal(ONE_ETHER)
                    expect(bucket.duration_).to.equal(ONE_DAY)
                    expect(bucket.delegate_).to.equal(DELEGATES[0])
                    expect(bucket.unlockedAt_).to.equal(UINT256_MAX)
                    expect(bucket.unstakedAt_).to.equal(UINT256_MAX)
                })
                it("should revert with deactivated", async () => {
                    await system.connect(owner).deactivateBucketType(ONE_ETHER, ONE_DAY)
                    await expect(
                        createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                    ).to.be.revertedWith("inactive bucket type")
                    await system.connect(owner).activateBucketType(ONE_ETHER, ONE_DAY)
                })
                it("should emit Staked", async () => {
                    await expect(
                        system.connect(staker)["stake(uint256,address)"](ONE_DAY, DELEGATES[0], {
                            value: ONE_ETHER,
                        })
                    )
                        .to.emit(system.connect(staker), "Staked")
                        .withArgs(anyValue, DELEGATES[0], ONE_ETHER, ONE_DAY)
                })
            })
        })

        describe("normal withdraw", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                await system.connect(staker).transferFrom(staker.address, alice.address, tokenId)
            })
            it("not owner", async () => {
                await expect(system.connect(staker)["unlock(uint256)"](tokenId)).to.be.revertedWith(
                    "not owner"
                )
            })
            it("invalid token id", async () => {
                const invalidTokenId = tokenId + 100
                await expect(
                    system.connect(staker).blocksToUnstake(invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).blocksToWithdraw(invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(system.connect(staker).bucketOf(invalidTokenId)).to.be.revertedWith(
                    "ERC721: invalid token ID"
                )
                await expect(
                    system.connect(staker)["unlock(uint256)"](invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker)["lock(uint256,uint256)"](invalidTokenId, ONE_DAY)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker)["unstake(uint256)"](invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system
                        .connect(staker)
                        ["withdraw(uint256,address)"](invalidTokenId, alice.address)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).expandBucket(invalidTokenId, ONE_ETHER, ONE_DAY)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).changeDelegate(invalidTokenId, DELEGATES[0])
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).changeDelegates([invalidTokenId], DELEGATES[0])
                ).to.be.revertedWith("ERC721: invalid token ID")
            })
            it("not unstakable", async () => {
                await expect(system.connect(alice).blocksToUnstake(tokenId)).to.be.revertedWith(
                    "not an unlocked bucket"
                )
            })
            describe("unlock", () => {
                beforeEach(async () => {
                    await system.connect(alice)["unlock(uint256)"](tokenId)
                    expect(ONE_DAY).to.be.equal(
                        await system.connect(alice).blocksToUnstake(tokenId)
                    )
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(staker)["unstake(uint256)"](tokenId)
                    ).to.be.revertedWith("not owner")
                })
                it("not an unstaked token", async () => {
                    await expect(system.blocksToWithdraw(tokenId)).to.be.revertedWith(
                        "not an unstaked bucket"
                    )
                })
                it("not ready to unstake", async () => {
                    await expect(
                        system.connect(alice)["unstake(uint256)"](tokenId)
                    ).to.be.revertedWith("not ready to unstake")
                })
                it("failed to unlock again", async () => {
                    await expect(
                        system.connect(alice)["unlock(uint256)"](tokenId)
                    ).to.be.revertedWith("not a locked token")
                })
                describe("lock again", () => {
                    it("not owner", async () => {
                        await expect(
                            system.connect(staker)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                        ).to.be.revertedWith("not owner")
                    })
                    it("invalid duration", async () => {
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, ONE_DAY - 100)
                        ).to.be.revertedWith("invalid duration")
                    })
                    it("inactive bucket type", async () => {
                        await system.deactivateBucketType(ONE_ETHER, ONE_DAY)
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                        ).to.be.revertedWith("inactive bucket type")
                    })
                    it("lock & unlock", async () => {
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                        )
                            .to.emit(system.connect(alice), "Locked")
                            .withArgs(tokenId, ONE_DAY)
                        await expect(
                            system.connect(alice).blocksToUnstake(tokenId)
                        ).to.be.revertedWith("not an unlocked bucket")
                        await expect(system.connect(alice)["unlock(uint256)"](tokenId))
                            .to.emit(system.connect(alice), "Unlocked")
                            .withArgs(tokenId)
                        expect(ONE_DAY).to.be.equal(
                            await system.connect(alice).blocksToUnstake(tokenId)
                        )
                    })
                })
                describe("unstake", () => {
                    beforeEach(async () => {
                        await advanceBy(BigNumber.from(ONE_DAY))
                        await expect(system.connect(alice)["unstake(uint256)"](tokenId))
                            .to.emit(system.connect(alice), "Unstaked")
                            .withArgs(tokenId)
                    })
                    it("unstaked bucket not transaferable", async () => {
                        await expect(
                            system
                                .connect(alice)
                                .transferFrom(alice.address, staker.address, tokenId)
                        ).to.be.revertedWith("cannot transfer unstaked token")
                    })
                    it("not withdrawable", async () => {
                        await expect(
                            system
                                .connect(alice)
                                ["withdraw(uint256,address)"](tokenId, alice.address)
                        ).to.be.revertedWith("not ready to withdraw")
                    })
                    describe("withdraw", () => {
                        beforeEach(async () => {
                            expect(await system.blocksToWithdraw(tokenId)).to.be.equal(3 * ONE_DAY)
                            await advanceBy(BigNumber.from(3 * ONE_DAY))
                            expect(await system.blocksToWithdraw(tokenId)).to.be.equal(0)
                        })
                        it("not owner", async () => {
                            await expect(
                                system
                                    .connect(staker)
                                    ["withdraw(uint256,address)"](tokenId, alice.address)
                            ).to.be.revertedWith("not owner")
                        })
                        it("succeed withdraw", async () => {
                            await expect(
                                await system
                                    .connect(alice)
                                    ["withdraw(uint256,address)"](tokenId, staker.address)
                            )
                                .to.changeEtherBalance(staker.address, ONE_ETHER)
                                .to.emit(system.connect(alice), "Withdrawal")
                                .withArgs(tokenId, staker.address)
                            await assertNotExist(system, tokenId)
                        })
                    })
                })
            })
        })

        describe("votes", () => {
            it("locked votes", async () => {
                await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                expect((await system.connect(staker).lockedVotesTo([DELEGATES[0]]))[0][0]).to.equal(
                    1
                )
            })

            it("unlocked votes", async () => {
                const tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                await system.connect(staker)["unlock(uint256)"](tokenId)
                expect(
                    (await system.connect(staker).unlockedVotesTo([DELEGATES[0]]))[0][0]
                ).to.equal(1)
            })

            describe("multiple delegates", () => {
                it("invalid parameters", async () => {
                    await expect(
                        system
                            .connect(staker)
                            ["stake(uint256,uint256,address[])"](ONE_ETHER, ONE_DAY, DELEGATES, {
                                value: BigNumber.from(ONE_ETHER).mul(DELEGATES.length).sub(1),
                            })
                    ).to.be.revertedWith("invalid parameters")
                    await expect(
                        system
                            .connect(staker)
                            ["stake(uint256,uint256,address,uint256)"](
                                ONE_ETHER,
                                ONE_DAY,
                                DELEGATES[0],
                                10,
                                {
                                    value: BigNumber.from(ONE_ETHER).mul(10).sub(1),
                                }
                            )
                    ).to.be.revertedWith("invalid parameters")
                })
                it("not active bucket type", async () => {
                    await system.deactivateBucketType(ONE_ETHER, ONE_DAY)
                    await expect(
                        createBuckets(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0], 10)
                    ).to.be.revertedWith("inactive bucket type")
                    await expect(
                        createBucketsForDelegates(system, staker, ONE_ETHER, ONE_DAY, DELEGATES)
                    ).to.be.revertedWith("inactive bucket type")
                })
                describe("success", () => {
                    const bucketNum = []
                    for (let i = 0; i < DELEGATES.length; i++) {
                        bucketNum.push((i + 1) % 10)
                    }
                    it("create one by one", async () => {
                        for (let i = 0; i < DELEGATES.length; i++) {
                            for (let j = 0; j < bucketNum[i]; j++) {
                                await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[i])
                            }
                        }
                    })
                    it("create by delegate in batch", async () => {
                        for (let i = 0; i < DELEGATES.length; i++) {
                            await createBuckets(
                                system,
                                staker,
                                ONE_ETHER,
                                ONE_DAY,
                                DELEGATES[i],
                                bucketNum[i]
                            )
                        }
                    })
                    it("create all in batch", async () => {
                        let list = []
                        for (let i = 0; i < DELEGATES.length; i++) {
                            for (let j = 0; j < bucketNum[i]; j++) {
                                list.push(DELEGATES[i])
                            }
                        }
                        await createBucketsForDelegates(system, staker, ONE_ETHER, ONE_DAY, list)
                    })
                    afterEach(async () => {
                        const votes = await system.connect(staker).lockedVotesTo(DELEGATES)
                        for (let i = 0; i < DELEGATES.length; i++) {
                            expect(votes[i][0]).to.equal(bucketNum[i])
                        }
                    })
                })
            })

            it("after increase amount", async () => {
                const tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                await system.connect(owner).addBucketType(ONE_ETHER.mul(2), ONE_DAY)
                await system
                    .connect(staker)
                    .expandBucket(tokenId, ONE_ETHER.mul(2), ONE_DAY, { value: ONE_ETHER })
                expect((await system.connect(staker).lockedVotesTo([DELEGATES[0]]))[0][0]).to.equal(
                    0
                )
                expect((await system.connect(staker).lockedVotesTo([DELEGATES[0]]))[0][1]).to.equal(
                    1
                )
            })

            it("after change delegate", async () => {
                const delegates = [
                    ethers.Wallet.createRandom().address,
                    ethers.Wallet.createRandom().address,
                ]
                const tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegates[0])
                await system.connect(staker).changeDelegate(tokenId, delegates[1])
                const votes = await system.connect(staker).lockedVotesTo(delegates)
                expect(votes[0][0]).to.equal(0)
                expect(votes[1][0]).to.equal(1)
            })
        })

        describe("batch", () => {
            let tokenIds: BigNumber[]
            beforeEach(async () => {
                tokenIds = new Array<BigNumber>(10)
                await system.connect(owner).addBucketType(ONE_ETHER.mul(11), ONE_DAY * 2)
                for (let i = 0; i < 10; i++) {
                    tokenIds[i] = await createBucket(
                        system,
                        staker,
                        ONE_ETHER,
                        ONE_DAY,
                        DELEGATES[i % 2]
                    )
                }
            })
            describe("merge", () => {
                it("invalid amount", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER.sub(1) })
                    ).to.be.revertedWith("invalid bucket type")
                })
                it("invalid duration", async () => {
                    await expect(
                        system.connect(staker).merge(tokenIds, ONE_DAY, { value: ONE_ETHER })
                    ).to.be.revertedWith("invalid bucket type")
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(owner).merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("not owner")
                })
                it("with empty token list", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .merge(Array<BigNumber>(0), ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("invalid length")
                })
                it("with invaid token id", async () => {
                    tokenIds[1] = 1000
                    await expect(
                        system.connect(staker).merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("ERC721: invalid token ID")
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker).merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("not a staked token")
                })
                it("with duplicate buckets", async () => {
                    tokenIds[0] = tokenIds[1]
                    await expect(
                        system.connect(staker).merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("ERC721: invalid token ID")
                })
                it("with invalid token id undo burned tokens", async () => {
                    tokenIds[1] = 1000
                    await expect(
                        system.connect(staker).merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("ERC721: invalid token ID")
                    for (let i = 2; i < 10; i++) {
                        await system.connect(staker).bucketOf(tokenIds[i])
                    }
                })
                describe("success", () => {
                    it("all locked buckets", async () => {})
                    it("with first unlocked bucket", async () => {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[0])
                    })
                    it("with multiple unlocked buckets", async () => {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[0])
                        await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                        await system.connect(staker)["unlock(uint256)"](tokenIds[5])
                    })
                    it("with multiple unlocked buckets II", async () => {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[4])
                        await system.connect(staker)["unlock(uint256)"](tokenIds[3])
                        await system.connect(staker)["unlock(uint256)"](tokenIds[5])
                    })
                    afterEach(async () => {
                        await expect(
                            system
                                .connect(staker)
                                .merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                        ).to.emit(system.connect(staker), "Merged")
                        for (let i = 1; i < tokenIds.length; i++) {
                            assertNotExist(system, tokenIds[i])
                        }
                        const bucket = await system.bucketOf(tokenIds[0])
                        expect(bucket.duration_).to.equal(ONE_DAY * 2)
                        expect(bucket.amount_).to.equal(ONE_ETHER.mul(11))
                        expect(bucket.delegate_).to.equal(DELEGATES[0])
                        expect(bucket.unlockedAt_).to.equal(UINT256_MAX)
                        expect(bucket.unstakedAt_).to.equal(UINT256_MAX)
                    })
                })
            })

            describe("unlock", () => {
                it("not owner", async () => {
                    tokenIds[1] = await createBucket(
                        system,
                        alice,
                        ONE_ETHER,
                        ONE_DAY,
                        DELEGATES[0]
                    )
                    await expect(system.connect(staker)["unlock(uint256[])"](tokenIds))
                        .to.emit(system.connect(staker), "Unlocked")
                        .to.be.revertedWith("not owner")
                })
                it("with unlocked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["unlock(uint256[])"](tokenIds)
                    ).to.be.revertedWith("not a locked token")
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["unlock(uint256[])"](tokenIds)
                    ).to.be.revertedWith("not a locked token")
                })
                it("success", async () => {
                    await expect(system.connect(staker)["unlock(uint256[])"](tokenIds)).to.emit(
                        system,
                        "Unlocked"
                    )
                    for (let i = 0; i < tokenIds.length; i++) {
                        const bucket = await system.bucketOf(tokenIds[i])
                        expect(bucket.unlockedAt_).to.equal(await ethers.provider.getBlockNumber())
                    }
                })
            })

            describe("lock", () => {
                it("not owner", async () => {
                    tokenIds[1] = await createBucket(
                        system,
                        alice,
                        ONE_ETHER,
                        ONE_DAY,
                        DELEGATES[0]
                    )
                    for (let i = 0; i < tokenIds.length; i++) {
                        if (i == 1) {
                            await system.connect(alice)["unlock(uint256)"](tokenIds[i])
                        } else {
                            await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                        }
                    }
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, ONE_DAY)
                    ).to.be.revertedWith("not owner")
                })
                it("with locked bucket", async () => {
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, ONE_DAY)
                    ).to.be.revertedWith("not an unlocked bucket")
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, ONE_DAY)
                    ).to.be.revertedWith("not an unlocked bucket")
                })
                it("success", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, ONE_DAY)
                    ).to.emit(system, "Locked")
                    for (let i = 0; i < tokenIds.length; i++) {
                        const bucket = await system.bucketOf(tokenIds[i])
                        expect(bucket.unlockedAt_).to.equal(UINT256_MAX)
                    }
                })
            })

            describe("unstake", () => {
                it("not owner", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await expect(
                        system.connect(alice)["unstake(uint256[])"](tokenIds)
                    ).to.be.revertedWith("not owner")
                })
                it("locked", async () => {
                    await expect(
                        system.connect(staker)["unstake(uint256[])"](tokenIds)
                    ).to.be.revertedWith("not an unlocked bucket")
                })
                it("not reached the stake duration", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system.connect(staker)["unstake(uint256[])"](tokenIds)
                    ).to.be.revertedWith("not ready to unstake")
                })
                it("success", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await expect(system.connect(staker)["unstake(uint256[])"](tokenIds)).to.emit(
                        system,
                        "Unstaked"
                    )
                    for (let i = 0; i < tokenIds.length; i++) {
                        const bucket = await system.bucketOf(tokenIds[i])
                        expect(bucket.unstakedAt_).to.equal(await ethers.provider.getBlockNumber())
                    }
                })
            })

            describe("withdraw", () => {
                it("not owner", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await expect(
                        system
                            .connect(alice)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWith("not owner")
                })
                it("locked", async () => {
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWith("not an unstaked bucket")
                })
                it("staked", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWith("not an unstaked bucket")
                })
                it("unstaked but not ready", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWith("not ready to withdraw")
                })
                it("unstaked but not ready II", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY * 3 - 2))
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWith("not ready to withdraw")
                })
                it("success", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY * 3))
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    )
                        .to.changeEtherBalance(staker.address, ONE_ETHER.mul(tokenIds.length))
                        .to.emit(system, "Withdrawal")
                    for (let i = 0; i < tokenIds.length; i++) {
                        await expect(system.bucketOf(tokenIds[i])).to.be.revertedWith(
                            "ERC721: invalid token ID"
                        )
                    }
                })
            })
        })
        describe("extend duration", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).expandBucket(tokenId, ONE_ETHER, ONE_DAY)
                ).to.be.revertedWith("not owner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_ETHER, ONE_DAY)
                ).to.be.revertedWith("not a locked token")
            })

            it("shorter duration", async () => {
                await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY * 0.5)
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_ETHER, ONE_DAY * 0.5)
                ).to.be.revertedWith("invalid duration")
            })

            it("not existed bucket type", async () => {
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_ETHER, ONE_DAY * 2)
                ).to.be.revertedWith("invalid bucket type")
            })

            describe("with a new bucket type", () => {
                const duration = ONE_DAY * 2
                beforeEach(async () => {
                    await system.connect(owner).addBucketType(ONE_ETHER, duration)
                })
                it("deactivated bucket type", async () => {
                    await system.connect(owner).deactivateBucketType(ONE_ETHER, duration)
                    await expect(
                        system.connect(staker).expandBucket(tokenId, ONE_ETHER, duration)
                    ).to.be.revertedWith("inactive bucket type")
                })

                it("success", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, ONE_ETHER, duration, { value: 0 })
                    )
                        .to.emit(system.connect(staker), "BucketExpanded")
                        .withArgs(tokenId, ONE_ETHER, duration)
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.duration_).to.equal(duration)
                })

                it("blocks to unstake", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenId)
                    await advanceBy(BigNumber.from(ONE_DAY))
                    expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(0)

                    await system.connect(staker)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                    await system.connect(staker).expandBucket(tokenId, ONE_ETHER, duration)
                    await system.connect(staker)["unlock(uint256)"](tokenId)
                    expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(duration)
                })
            })
        })

        describe("increase amount", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).expandBucket(tokenId, ONE_ETHER, ONE_DAY, { value: 0 })
                ).to.be.revertedWith("not owner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_ETHER, ONE_DAY, { value: 0 })
                ).to.be.revertedWith("not a locked token")
            })

            it("not existed bucket type", async () => {
                await expect(
                    system
                        .connect(staker)
                        .expandBucket(tokenId, ONE_ETHER.mul(2), ONE_DAY, { value: ONE_ETHER })
                ).to.be.revertedWith("invalid bucket type")
            })

            describe("with a new bucket type", () => {
                const amount = ONE_ETHER.mul(2)
                beforeEach(async () => {
                    await system.connect(owner).addBucketType(amount, ONE_DAY)
                })
                it("invalid amount", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY, { value: ONE_ETHER.div(2) })
                    ).to.be.revertedWith("invalid amount")
                })

                it("deactivated bucket type", async () => {
                    await system.connect(owner).deactivateBucketType(amount, ONE_DAY)
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY, { value: ONE_ETHER })
                    ).to.be.revertedWith("inactive bucket type")
                })

                it("success", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY, { value: ONE_ETHER })
                    )
                        .to.emit(system.connect(staker), "BucketExpanded")
                        .withArgs(tokenId, amount, ONE_DAY)
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount_).to.equal(amount)
                })
            })
        })

        describe("expand bucket type", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system
                        .connect(alice)
                        .expandBucket(tokenId, ONE_ETHER.mul(2), ONE_DAY * 2, { value: ONE_ETHER })
                ).to.be.revertedWith("not owner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system
                        .connect(staker)
                        .expandBucket(tokenId, ONE_ETHER.mul(2), ONE_DAY * 2, { value: ONE_ETHER })
                ).to.be.revertedWith("not a locked token")
            })

            it("not existed bucket type", async () => {
                await expect(
                    system
                        .connect(staker)
                        .expandBucket(tokenId, ONE_ETHER.mul(2), ONE_DAY * 3, { value: ONE_ETHER })
                ).to.be.revertedWith("invalid bucket type")
            })

            describe("with a new bucket type", () => {
                const amount = ONE_ETHER.mul(2)
                beforeEach(async () => {
                    await system.connect(owner).addBucketType(ONE_ETHER, ONE_DAY * 2)
                    await system.connect(owner).addBucketType(amount, ONE_DAY)
                    await system.connect(owner).addBucketType(amount, ONE_DAY * 2)
                })
                it("not enough pay", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY * 2, { value: ONE_ETHER.div(2) })
                    ).to.be.revertedWith("invalid amount")
                })

                it("shorter duration", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY * 0.5, { value: ONE_ETHER })
                    ).to.be.revertedWith("invalid duration")
                })

                it("deactivated bucket type", async () => {
                    await system.connect(owner).deactivateBucketType(amount, ONE_DAY * 2)
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWith("inactive bucket type")
                })

                it("success", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, amount, ONE_DAY * 2, { value: ONE_ETHER })
                    )
                        .to.emit(system.connect(staker), "BucketExpanded")
                        .withArgs(tokenId, amount, ONE_DAY * 2)
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount_).to.equal(amount)
                })
            })
        })

        describe("change delegate", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).changeDelegate(tokenId, DELEGATES[2])
                ).to.be.revertedWith("not owner")
            })
            it("same delegate", async () => {
                await expect(
                    system.connect(staker).changeDelegate(tokenId, DELEGATES[0])
                ).to.be.revertedWith("invalid operation")
            })
            it("locked", async () => {
                await expect(system.connect(staker).changeDelegate(tokenId, DELEGATES[2]))
                    .to.emit(system.connect(staker), "DelegateChanged")
                    .withArgs(tokenId, DELEGATES[2])
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate_).to.equal(DELEGATES[2])
            })

            it("unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await system.connect(staker).changeDelegate(tokenId, DELEGATES[2])
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate_).to.equal(DELEGATES[2])
            })

            it("unstaked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await advanceBy(BigNumber.from(ONE_DAY))
                await system.connect(staker)["unstake(uint256)"](tokenId)
                await expect(
                    system.connect(staker).changeDelegate(tokenId, DELEGATES[2])
                ).to.be.revertedWith("not a staked token")
            })
        })

        describe("batch change delegates", () => {
            let tokenIds: BigNumber[]
            beforeEach(async () => {
                tokenIds = await createBuckets(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0], 4)
            })

            it("not owner", async () => {
                await expect(
                    system.connect(alice).changeDelegates(tokenIds, DELEGATES[2])
                ).to.be.revertedWith("not owner")
            })

            it("success", async () => {
                await system.connect(staker).changeDelegates(tokenIds, DELEGATES[2])
                for (let i = 0; i < tokenIds.length; i++) {
                    const bucket = await system.bucketOf(tokenIds[i])
                    expect(bucket.delegate_).to.equal(DELEGATES[2])
                }
            })
        })
    })
})
