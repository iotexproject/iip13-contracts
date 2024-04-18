import { ethers } from "hardhat"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish, BytesLike } from "ethers"
import { SystemStaking2 } from "../typechain"
import { advanceBy, duration } from "./utils"
import { assert } from "console"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { token } from "../typechain/@openzeppelin/contracts"

const createBucket = async (
    system: SystemStaking2,
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
    system: SystemStaking2,
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
    system: SystemStaking2,
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

const assertNotExist = async (system: SystemStaking2, tokenId: BigNumberish) => {
    await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")
}

describe("SystemStaking2", () => {
    let system: SystemStaking2

    let owner: SignerWithAddress
    let staker: SignerWithAddress
    let alice: SignerWithAddress
    let beneficiary: SignerWithAddress

    before(async () => {
        ;[owner, staker, alice, beneficiary] = await ethers.getSigners()
    })

    describe("owner", () => {
        beforeEach(async () => {
            const factory = await ethers.getContractFactory("SystemStaking2")
            system = (await factory.deploy(ONE_ETHER, beneficiary.address)) as SystemStaking2
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
                    await expect(system.expandBucket(1, ONE_DAY, {
                        value: ONE_ETHER,
                    })).to.be.revertedWith(
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
    })

    describe("stake flow", () => {
        beforeEach(async () => {
            const factory = await ethers.getContractFactory("SystemStaking2")
            system = (await factory.deploy(ONE_ETHER, beneficiary.address)) as SystemStaking2
        })

        describe("create bucket", () => {
            it("should revert with invalid data", async () => {
                await expect(
                    createBucket(system, staker, ONE_ETHER, ONE_DAY + 1, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")

                await expect(
                    createBucket(system, staker, ONE_ETHER, ONE_DAY * 365 * 3 + 1, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")

                await expect(
                    createBucket(system, staker, 99, ONE_DAY, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidAmount")
            })

            it("success", async () => {
                const tokenId = await createBucket(
                    system,
                    staker,
                    ONE_ETHER,
                    ONE_DAY,
                    DELEGATES[0]
                )
                expect(staker.address).to.equal(await system.ownerOf(tokenId))
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.amount).to.equal(ONE_ETHER)
                expect(bucket.duration).to.equal(ONE_DAY)
                expect(bucket.delegate).to.equal(DELEGATES[0])
                expect(bucket.unlockedAt).to.equal(UINT256_MAX)
                expect(bucket.unstakedAt).to.equal(UINT256_MAX)
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

        describe("normal withdraw", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                await system.connect(staker).transferFrom(staker.address, alice.address, tokenId)
            })
            it("not owner", async () => {
                await expect(
                    system.connect(staker)["unlock(uint256)"](tokenId)
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })
            it("invalid token id", async () => {
                const invalidTokenId = tokenId + 100
                await expect(
                    system.connect(staker).blocksToUnstake(invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).blocksToWithdraw(invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).bucketOf(invalidTokenId)
                ).to.be.revertedWith("ERC721: invalid token ID")
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
                    system.connect(staker).expandBucket(invalidTokenId, ONE_DAY)
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).changeDelegate(invalidTokenId, DELEGATES[0])
                ).to.be.revertedWith("ERC721: invalid token ID")
                await expect(
                    system.connect(staker).changeDelegates([invalidTokenId], DELEGATES[0])
                ).to.be.revertedWith("ERC721: invalid token ID")
            })
            it("locked", async () => {
                expect(
                    await system.connect(alice).blocksToUnstake(tokenId)
                ).to.be.equal(ONE_DAY)
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
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("not an unstaked token", async () => {
                    await expect(
                        system.blocksToWithdraw(tokenId)
                    ).to.be.revertedWithCustomError(system, "ErrStakedBucketCannotBeWithdrawn")
                })
                it("not ready to unstake", async () => {
                    await expect(
                        system.connect(alice)["unstake(uint256)"](tokenId)
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
                })
                it("failed to unlock again", async () => {
                    await expect(
                        system.connect(alice)["unlock(uint256)"](tokenId)
                    ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
                })
                describe("lock again", () => {
                    it("not owner", async () => {
                        await expect(
                            system.connect(staker)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                        ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                    })
                    it("invalid duration", async () => {
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, ONE_DAY - 100)
                        ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, ONE_DAY * 365 * 3 + 1)
                        ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                    })
                    it("lock & unlock", async () => {
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                        )
                            .to.emit(system.connect(alice), "Locked")
                            .withArgs(tokenId, ONE_DAY)
                        expect(
                            await system.connect(alice).blocksToUnstake(tokenId)
                        ).to.be.equal(ONE_DAY)
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
                    it("not withdrawable", async () => {
                        await expect(
                            system
                                .connect(alice)
                                ["withdraw(uint256,address)"](tokenId, alice.address)
                        ).to.be.revertedWithCustomError(system, "ErrNotReady")
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
                            ).to.be.revertedWithCustomError(system, "ErrNotOwner")
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
            describe("multiple delegates", () => {
                it("invalid parameters", async () => {
                    await expect(
                        system
                            .connect(staker)
                            ["stake(uint256,uint256,address[])"](ONE_ETHER, ONE_DAY, DELEGATES, {
                                value: BigNumber.from(ONE_ETHER).mul(DELEGATES.length).sub(1),
                            })
                    ).to.be.revertedWithCustomError(system, "ErrInvalidAmount")
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
                    ).to.be.revertedWithCustomError(system, "ErrInvalidAmount")
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
                        // TODO: check buckets
                    })
                })
            })

            it("after increase amount", async () => {
                const tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
                await system
                    .connect(staker)
                    .expandBucket(tokenId, ONE_DAY, { value: ONE_ETHER })
                // TODO: check event and buckets
            })

            it("after change delegate", async () => {
                const delegates = [
                    ethers.Wallet.createRandom().address,
                    ethers.Wallet.createRandom().address,
                ]
                const tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, delegates[0])
                await system.connect(staker).changeDelegate(tokenId, delegates[1])
                // TODO: check bucket
            })
        })

        describe("batch", () => {
            let tokenIds: BigNumber[]
            beforeEach(async () => {
                tokenIds = new Array<BigNumber>(10)
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
                it("invalid duration", async () => {
                    await expect(
                        system.connect(staker).merge(tokenIds, ONE_DAY - 100, { value: ONE_ETHER })
                    ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(owner).merge(tokenIds, ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("with empty token list", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .merge(Array<BigNumber>(0), ONE_DAY * 2, { value: ONE_ETHER })
                    ).to.be.revertedWithCustomError(system, "ErrInvalidParameter")
                })
                it("with invaid token id", async () => {
                    tokenIds[1] = 10000
                    console.log(await system.num)
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
                    ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
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
                        expect(bucket.duration).to.equal(ONE_DAY * 2)
                        expect(bucket.amount).to.equal(ONE_ETHER.mul(11))
                        expect(bucket.delegate).to.equal(DELEGATES[0])
                        expect(bucket.unlockedAt).to.equal(UINT256_MAX)
                        expect(bucket.unstakedAt).to.equal(UINT256_MAX)
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
                        .to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("with unlocked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["unlock(uint256[])"](tokenIds)
                    ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["unlock(uint256[])"](tokenIds)
                    ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
                })
                it("success", async () => {
                    await expect(system.connect(staker)["unlock(uint256[])"](tokenIds)).to.emit(
                        system,
                        "Unlocked"
                    )
                    for (let i = 0; i < tokenIds.length; i++) {
                        const bucket = await system.bucketOf(tokenIds[i])
                        expect(bucket.unlockedAt).to.equal(await ethers.provider.getBlockNumber())
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
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("with locked bucket", async () => {
                    await system.connect(staker)["lock(uint256[],uint256)"](tokenIds, ONE_DAY)
                    // TODO: check bucket
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, ONE_DAY)
                    ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
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
                        expect(bucket.unlockedAt).to.equal(UINT256_MAX)
                    }
                })
            })

            describe("unstake", () => {
                it("not owner", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(ONE_DAY))
                    await expect(
                        system.connect(alice)["unstake(uint256[])"](tokenIds)
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("locked", async () => {
                    await expect(
                        system.connect(staker)["unstake(uint256[])"](tokenIds)
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
                })
                it("not reached the stake duration", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system.connect(staker)["unstake(uint256[])"](tokenIds)
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
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
                        expect(bucket.unstakedAt).to.equal(await ethers.provider.getBlockNumber())
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
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("locked", async () => {
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWithCustomError(system, "ErrStakedBucketCannotBeWithdrawn")
                })
                it("staked", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWithCustomError(system, "ErrStakedBucketCannotBeWithdrawn")
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
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
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
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
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
                    system.connect(alice).expandBucket(tokenId, ONE_DAY)
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_DAY)
                ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
            })

            it("shorter duration", async () => {
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_DAY * 0.5)
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
            })

            it("success", async () => {
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_DAY * 2)
                )
                    .to.emit(system.connect(staker), "BucketExpanded")
                    .withArgs(tokenId, ONE_ETHER, ONE_DAY * 2)
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.duration).to.equal(ONE_DAY * 2)
            })

            it("blocks to unstake", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await advanceBy(BigNumber.from(ONE_DAY))
                expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(0)
                await system.connect(staker)["lock(uint256,uint256)"](tokenId, ONE_DAY)
                await system.connect(staker).expandBucket(tokenId, ONE_DAY * 2)
                await system.connect(staker)["unlock(uint256)"](tokenId)
                expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(ONE_DAY * 2)
            })
        })

        describe("increase amount", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, ONE_ETHER, ONE_DAY, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).expandBucket(tokenId, ONE_DAY, { value: 0 })
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, ONE_DAY, { value: 0 })
                ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
            })

            it("success", async () => {
                const amount = ONE_ETHER.mul(2)
                await expect(
                    system
                        .connect(staker)
                        .expandBucket(tokenId, ONE_DAY, { value: ONE_ETHER })
                )
                    .to.emit(system.connect(staker), "BucketExpanded")
                    .withArgs(tokenId, amount, ONE_DAY)
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.amount).to.equal(amount)
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
                        .expandBucket(tokenId, ONE_DAY * 2, { value: ONE_ETHER })
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system
                        .connect(staker)
                        .expandBucket(tokenId, ONE_DAY * 2, { value: ONE_ETHER })
                ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
            })

            describe("with a new bucket type", () => {
                const amount = ONE_ETHER.mul(2)
                it("shorter duration", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, ONE_DAY * 0.5, { value: ONE_ETHER })
                    ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                })
                it("success", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .expandBucket(tokenId, ONE_DAY * 2, { value: ONE_ETHER })
                    )
                        .to.emit(system.connect(staker), "BucketExpanded")
                        .withArgs(tokenId, amount, ONE_DAY * 2)
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount).to.equal(amount)
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
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })
            it("same delegate", async () => {
                await expect(
                    system.connect(staker).changeDelegate(tokenId, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidParameter")
            })
            it("locked", async () => {
                await expect(system.connect(staker).changeDelegate(tokenId, DELEGATES[2]))
                    .to.emit(system.connect(staker), "DelegateChanged")
                    .withArgs(tokenId, DELEGATES[2])
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate).to.equal(DELEGATES[2])
            })

            it("unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await system.connect(staker).changeDelegate(tokenId, DELEGATES[2])
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate).to.equal(DELEGATES[2])
            })

            it("unstaked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await advanceBy(BigNumber.from(ONE_DAY))
                await system.connect(staker)["unstake(uint256)"](tokenId)
                await expect(
                    system.connect(staker).changeDelegate(tokenId, DELEGATES[2])
                ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
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
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("success", async () => {
                await system.connect(staker).changeDelegates(tokenIds, DELEGATES[2])
                for (let i = 0; i < tokenIds.length; i++) {
                    const bucket = await system.bucketOf(tokenIds[i])
                    expect(bucket.delegate).to.equal(DELEGATES[2])
                }
            })
        })
    })
})
