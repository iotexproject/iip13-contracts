import { ethers } from "hardhat"
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish, BytesLike } from "ethers"
import { SystemStaking2 } from "../typechain"
import { advanceBy, duration } from "./utils"
import { assert } from "console"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { token } from "../typechain/@openzeppelin/contracts"
import { hexZeroPad } from "@ethersproject/bytes"

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

const DURATION_UNIT = 86400 / 5
const MAX_DURATION = DURATION_UNIT * 365 * 3;
const MIN_AMOUNT = ethers.utils.parseEther("1")

const assertNotExist = async (system: SystemStaking2, tokenId: BigNumberish) => {
    await expect(system.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")
}

const expectBucket = async (
    system: SystemStaking2,
    tokenId: BigNumberish,
    owner: string,
    amount: BigNumberish,
    duration: BigNumberish,
    delegate: string,
    unlockedAt: BigNumberish,
    unstakedAt: BigNumberish
) => {
    expect(await system.ownerOf(tokenId)).to.equal(owner)
    const bucket = await system.bucketOf(tokenId)
    expect(bucket.amount).to.equal(amount)
    expect(bucket.duration).to.equal(duration)
    expect(bucket.delegate).to.equal(delegate)
    if (unlockedAt != undefined) {
        expect(bucket.unlockedAt).to.equal(unlockedAt)
    }
    if (unstakedAt != undefined) {
        expect(bucket.unstakedAt).to.equal(unstakedAt)
    }
}

describe("SystemStaking2", () => {
    let system: SystemStaking2

    let owner: SignerWithAddress
    let staker: SignerWithAddress
    let alice: SignerWithAddress
    let beneficiary: SignerWithAddress

    before(async () => {
        [owner, staker, alice, beneficiary] = await ethers.getSigners()
    })

    describe("owner", () => {
        beforeEach(async () => {
            const factory = await ethers.getContractFactory("SystemStaking2")
            system = (await factory.deploy(MIN_AMOUNT)) as SystemStaking2
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
                    [
                        createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0]),
                        createBuckets(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0], 2),
                        createBucketsForDelegates(system, staker, MIN_AMOUNT, DURATION_UNIT, [
                            DELEGATES[0],
                        ]),
                        system["lock(uint256,uint256)"](1, DURATION_UNIT),
                        system["unlock(uint256)"](1),
                        system["unstake(uint256)"](1),
                        system["withdraw(uint256,address)"](1, staker.address),
                        system.expandBucket(1, DURATION_UNIT, {value: MIN_AMOUNT,}),
                        system.changeDelegate(1, DELEGATES[0]),
                        system.changeDelegates([1], DELEGATES[0]),
                    ].forEach(async(element) => {
                        await expect(element).to.be.revertedWith("Pausable: paused")
                    })
                })
            })
        })
    })

    describe("stake flow", () => {
        beforeEach(async () => {
            const factory = await ethers.getContractFactory("SystemStaking2")
            system = (await factory.deploy(MIN_AMOUNT)) as SystemStaking2
        })

        describe("create bucket", () => {
            it("should revert with invalid data", async () => {
                await expect(
                    createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT + 1, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")

                await expect(
                    createBucket(system, staker, MIN_AMOUNT, MAX_DURATION + 1, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")

                await expect(
                    createBucket(system, staker, 99, DURATION_UNIT, DELEGATES[0])
                ).to.be.revertedWithCustomError(system, "ErrInvalidAmount")
            })

            it("success", async () => {
                const tokenId = await createBucket(
                    system,
                    staker,
                    MIN_AMOUNT,
                    DURATION_UNIT,
                    DELEGATES[0]
                )
                await expectBucket(
                    system,
                    tokenId,
                    staker.address,
                    MIN_AMOUNT,
                    DURATION_UNIT,
                    DELEGATES[0],
                    UINT256_MAX,
                    UINT256_MAX,
                )
            })
            it("should emit Staked", async () => {
                await expect(
                    system.connect(staker)["stake(uint256,address)"](DURATION_UNIT, DELEGATES[0], {
                        value: MIN_AMOUNT,
                    })
                )
                    .to.emit(system.connect(staker), "Staked")
                    .withArgs(anyValue, DELEGATES[0], MIN_AMOUNT, DURATION_UNIT)
            })
        })

        describe("normal withdraw", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, MIN_AMOUNT.mul(2).sub(1), DURATION_UNIT, DELEGATES[0])
                await system.connect(staker).transferFrom(staker.address, alice.address, tokenId)
            })
            it("not owner", async () => {
                await expect(
                    system.connect(staker)["unlock(uint256)"](tokenId)
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })
            it("invalid token id", async () => {
                const invalidTokenId = tokenId + 100;
                [
                    system.connect(staker).blocksToUnstake(invalidTokenId),
                    system.connect(staker).blocksToWithdraw(invalidTokenId),
                    system.connect(staker).bucketOf(invalidTokenId),
                    system.connect(staker)["unlock(uint256)"](invalidTokenId),
                    system.connect(staker)["lock(uint256,uint256)"](invalidTokenId, DURATION_UNIT),
                    system.connect(staker)["unstake(uint256)"](invalidTokenId),
                    system.connect(staker)["withdraw(uint256,address)"](invalidTokenId, alice.address),
                    system.connect(staker).expandBucket(invalidTokenId, DURATION_UNIT),
                    system.connect(staker).changeDelegate(invalidTokenId, DELEGATES[0]),
                    system.connect(staker).changeDelegates([invalidTokenId], DELEGATES[0]),
                    system.connect(staker).donate(invalidTokenId)
                ].forEach(async element => {
                    await expect(element).to.be.revertedWith("ERC721: invalid token ID")
                })
            })
            it("check duration of locked", async () => {
                expect(
                    await system.connect(alice).blocksToUnstake(tokenId)
                ).to.be.equal(DURATION_UNIT)
            })
            describe("beneficiary", () => {
                beforeEach(async () => {
                    expect(await system.beneficiary()).to.be.equal(hexZeroPad(0, 20))
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(alice).setBeneficiary(alice.address)
                    ).to.be.revertedWith("Ownable: caller is not the owner")
                })
                it("success", async () => {
                    await system.connect(owner).setBeneficiary(alice.address)
                    expect(await system.beneficiary()).to.be.equal(alice.address)
                    await system.connect(owner).setBeneficiary(beneficiary.address)
                    expect(await system.beneficiary()).to.be.equal(beneficiary.address)
                })
            })
            describe("donate", () => {
                beforeEach(async () => {
                    await system.setBeneficiary(beneficiary.address)
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(staker).donate(tokenId, MIN_AMOUNT)
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("invalid amount", async () => {
                    [
                        system.connect(alice).donate(tokenId, MIN_AMOUNT.mul(2).sub(1)),
                        system.connect(alice).donate(tokenId, 0),
                        system.connect(alice).donate(tokenId, MIN_AMOUNT),
                    ].forEach(async element => {
                        await expect(element).to.be.revertedWithCustomError(system, "ErrInvalidAmount")
                    })
                })
                it("lock & donate", async () => {
                    expect(
                        await system.connect(alice).donate(tokenId, MIN_AMOUNT.sub(1))
                    ).to.emit(system, "Donated").withArgs(tokenId, MIN_AMOUNT.sub(1))
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount).to.equal(MIN_AMOUNT)
                })
                it("unlock & donate", async () => {
                    await system.connect(alice)["unlock(uint256)"](tokenId)
                    expect(
                        await system.connect(alice).donate(tokenId, MIN_AMOUNT.sub(1))
                    ).to.emit(system, "Donated").withArgs(tokenId, MIN_AMOUNT.sub(1))
                    const bucket = await system.bucketOf(tokenId)
                    expect(bucket.amount).to.equal(MIN_AMOUNT)
                })
                it("unstake & donate", async () => {
                    await system.connect(alice)["unlock(uint256)"](tokenId)
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(alice)["unstake(uint256)"](tokenId)
                    await expect(
                        system.connect(alice).donate(tokenId, MIN_AMOUNT.div(2))
                    ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
                })
            })
            describe("unlock", () => {
                beforeEach(async () => {
                    await system.connect(alice)["unlock(uint256)"](tokenId)
                    expect(
                        await system.connect(alice).blocksToUnstake(tokenId)
                    ).to.be.equal(DURATION_UNIT)
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(staker)["unstake(uint256)"](tokenId)
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("not an unstaked token", async () => {
                    await expect(
                        system.blocksToWithdraw(tokenId)
                    ).to.be.revertedWithCustomError(system, "ErrNotUnstakedBucket")
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
                            system.connect(staker)["lock(uint256,uint256)"](tokenId, DURATION_UNIT)
                        ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                    })
                    it("invalid duration", async () => {
                        [
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, DURATION_UNIT - 100),
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, MAX_DURATION + 1)
                        ].forEach(async element => {
                            await expect(elsement).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                        })
                    })
                    it("lock & unlock", async () => {
                        await expect(
                            system.connect(alice)["lock(uint256,uint256)"](tokenId, DURATION_UNIT)
                        )
                            .to.emit(system.connect(alice), "Locked")
                            .withArgs(tokenId, DURATION_UNIT)
                        expect(
                            await system.connect(alice).blocksToUnstake(tokenId)
                        ).to.be.equal(DURATION_UNIT)
                        await expect(system.connect(alice)["unlock(uint256)"](tokenId))
                            .to.emit(system.connect(alice), "Unlocked")
                            .withArgs(tokenId)
                        expect(
                            await system.connect(alice).blocksToUnstake(tokenId)
                        ).to.be.equal(DURATION_UNIT)
                    })
                })
                describe("unstake", () => {
                    beforeEach(async () => {
                        await advanceBy(BigNumber.from(DURATION_UNIT))
                        await expect(system.connect(alice)["unstake(uint256)"](tokenId))
                            .to.emit(system.connect(alice), "Unstaked")
                            .withArgs(tokenId)
                    })
                    it("not withdrawable", async () => {
                        await expect(
                            system.connect(alice)["withdraw(uint256,address)"](tokenId, alice.address)
                        ).to.be.revertedWithCustomError(system, "ErrNotReady")
                    })
                    describe("withdraw", () => {
                        beforeEach(async () => {
                            expect(await system.blocksToWithdraw(tokenId)).to.be.equal(3 * DURATION_UNIT)
                            await advanceBy(BigNumber.from(3 * DURATION_UNIT))
                            expect(await system.blocksToWithdraw(tokenId)).to.be.equal(0)
                        })
                        it("not owner", async () => {
                            await expect(
                                system.connect(staker)["withdraw(uint256,address)"](tokenId, alice.address)
                            ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                        })
                        it("succeed withdraw", async () => {
                            await expect(
                                await system.connect(alice)["withdraw(uint256,address)"](tokenId, staker.address)
                            )
                                .to.changeEtherBalance(staker.address, MIN_AMOUNT.mul(2).sub(1))
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
                it("invalid amount", async () => {
                    [
                        system.connect(staker)
                            ["stake(uint256,uint256,address[])"](MIN_AMOUNT, DURATION_UNIT, DELEGATES, {
                                value: BigNumber.from(MIN_AMOUNT).mul(DELEGATES.length).sub(1),
                            }),
                        system.connect(staker)
                            ["stake(uint256,uint256,address,uint256)"](
                                MIN_AMOUNT,
                                DURATION_UNIT,
                                DELEGATES[0],
                                10,
                                {
                                    value: BigNumber.from(MIN_AMOUNT).mul(10).sub(1),
                                }
                            )
                    ].forEach(async element => {
                        await expect(element).to.be.revertedWithCustomError(system, "ErrInvalidAmount")
                    })
                })
                it('invalid duration', async () => {
                    [
                        system.connect(staker)["stake(uint256,uint256,address[])"](
                            MIN_AMOUNT,
                            MAX_DURATION + 1,
                            DELEGATES,
                            {
                                value: BigNumber.from(MIN_AMOUNT).mul(DELEGATES.length),
                            }
                        ),
                        system.connect(staker)["stake(uint256,uint256,address[])"](
                            MIN_AMOUNT,
                            DURATION_UNIT - 1,
                            DELEGATES,
                            {
                                value: BigNumber.from(MIN_AMOUNT).mul(DELEGATES.length),
                            }
                        ),
                    ].forEach(async element => {
                        await expect(element).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                    })
                })
                describe("success", () => {
                    const bucketNum = []
                    for (let i = 0; i < DELEGATES.length; i++) {
                        assertNotExist(system, (i + 1) % 10)
                        bucketNum.push((i + 1) % 10)
                    }
                    it("create one by one", async () => {
                        for (let i = 0; i < DELEGATES.length; i++) {
                            for (let j = 0; j < bucketNum[i]; j++) {
                                await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[i])
                            }
                        }
                    })
                    it("create by delegate in batch", async () => {
                        for (let i = 0; i < DELEGATES.length; i++) {
                            await createBuckets(
                                system,
                                staker,
                                MIN_AMOUNT,
                                DURATION_UNIT,
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
                        await createBucketsForDelegates(system, staker, MIN_AMOUNT, DURATION_UNIT, list)
                    })
                    afterEach(async () => {
                        bucketNum.forEach(async i => {
                            expect(await system.ownerOf(i)).to.be.equal(staker.address)
                        })
                    })
                })
            })

            it("after increase amount", async () => {
                const tokenId = await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0])
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT, { value: MIN_AMOUNT })
                ).to.emit(system, 'BucketExpanded').withArgs(tokenId, MIN_AMOUNT.mul(2), DURATION_UNIT)
                // TODO: check event and buckets
            })

            it("after change delegate", async () => {
                const delegates = [
                    ethers.Wallet.createRandom().address,
                    ethers.Wallet.createRandom().address,
                ]
                const tokenId = await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, delegates[0])
                await system.connect(staker).changeDelegate(tokenId, delegates[1])
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.delegate).to.equal(delegates[1])
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
                        MIN_AMOUNT,
                        DURATION_UNIT,
                        DELEGATES[i % 2]
                    )
                }
            })
            describe("merge", () => {
                it("invalid duration", async () => {
                    await expect(
                        system.connect(staker).merge(tokenIds, DURATION_UNIT - 100, { value: MIN_AMOUNT })
                    ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
                })
                it("not owner", async () => {
                    await expect(
                        system.connect(owner).merge(tokenIds, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("with empty token list", async () => {
                    await expect(
                        system
                            .connect(staker)
                            .merge(Array<BigNumber>(0), DURATION_UNIT * 2, { value: MIN_AMOUNT })
                    ).to.be.revertedWithCustomError(system, "ErrInvalidParameter")
                })
                it("with invaid token id", async () => {
                    tokenIds[1] = 10000
                    await expect(
                        system.connect(staker).merge(tokenIds, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                    ).to.be.revertedWith("ERC721: invalid token ID")
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker).merge(tokenIds, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                    ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
                })
                it("with duplicate buckets", async () => {
                    tokenIds[0] = tokenIds[1]
                    await expect(
                        system.connect(staker).merge(tokenIds, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                    ).to.be.revertedWith("ERC721: invalid token ID")
                })
                it("with invalid token id undo burned tokens", async () => {
                    tokenIds[1] = 1000
                    await expect(
                        system.connect(staker).merge(tokenIds, DURATION_UNIT * 2, { value: MIN_AMOUNT })
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
                                .merge(tokenIds, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                        ).to.emit(system.connect(staker), "Merged")
                        for (let i = 1; i < tokenIds.length; i++) {
                            assertNotExist(system, tokenIds[i])
                        }
                        const bucket = await system.bucketOf(tokenIds[0])
                        expect(bucket.duration).to.equal(DURATION_UNIT * 2)
                        expect(bucket.amount).to.equal(MIN_AMOUNT.mul(11))
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
                        MIN_AMOUNT,
                        DURATION_UNIT,
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
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["unlock(uint256[])"](tokenIds)
                    ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
                })
                it("success", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
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
                        MIN_AMOUNT,
                        DURATION_UNIT,
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
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, DURATION_UNIT)
                    ).to.be.revertedWithCustomError(system, "ErrNotOwner")
                })
                it("with locked bucket", async () => {
                    await system.connect(staker)["lock(uint256[],uint256)"](tokenIds, DURATION_UNIT)
                    tokenIds.forEach(async id => {
                        const bucket = await system.bucketOf(id)
                        expect(bucket.unlockedAt).to.equal(UINT256_MAX)
                    })
                })
                it("with unstaked bucket", async () => {
                    await system.connect(staker)["unlock(uint256)"](tokenIds[2])
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(staker)["unstake(uint256)"](tokenIds[2])
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, DURATION_UNIT)
                    ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
                })
                it("success", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system.connect(staker)["lock(uint256[],uint256)"](tokenIds, DURATION_UNIT)
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
                    await advanceBy(BigNumber.from(DURATION_UNIT))
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
                    await advanceBy(BigNumber.from(DURATION_UNIT))
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
                    await advanceBy(BigNumber.from(DURATION_UNIT))
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
                    ).to.be.revertedWithCustomError(system, "ErrNotUnstakedBucket")
                })
                it("staked", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWithCustomError(system, "ErrNotUnstakedBucket")
                })
                it("unstaked but not ready", async () => {
                    for (let i = 0; i < tokenIds.length; i++) {
                        await system.connect(staker)["unlock(uint256)"](tokenIds[i])
                    }
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
                })
                it("unstaked but not ready II", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(DURATION_UNIT * 3 - 2))
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    ).to.be.revertedWithCustomError(system, "ErrNotReady")
                })
                it("success", async () => {
                    await system.connect(staker)["unlock(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(DURATION_UNIT))
                    await system.connect(staker)["unstake(uint256[])"](tokenIds)
                    await advanceBy(BigNumber.from(DURATION_UNIT * 3))
                    await expect(
                        system
                            .connect(staker)
                            ["withdraw(uint256[],address)"](tokenIds, staker.address)
                    )
                        .to.changeEtherBalance(staker.address, MIN_AMOUNT.mul(tokenIds.length))
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
                tokenId = await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).expandBucket(tokenId, DURATION_UNIT)
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT)
                ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
            })

            it("shorter duration", async () => {
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT * 0.5)
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
            })

            it("success", async () => {
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT * 2)
                )
                    .to.emit(system.connect(staker), "BucketExpanded")
                    .withArgs(tokenId, MIN_AMOUNT, DURATION_UNIT * 2)
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.duration).to.equal(DURATION_UNIT * 2)
            })

            it("blocks to unstake", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await advanceBy(BigNumber.from(DURATION_UNIT))
                expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(0)
                await system.connect(staker)["lock(uint256,uint256)"](tokenId, DURATION_UNIT)
                await system.connect(staker).expandBucket(tokenId, DURATION_UNIT * 2)
                await system.connect(staker)["unlock(uint256)"](tokenId)
                expect(await system.connect(staker).blocksToUnstake(tokenId)).to.equal(DURATION_UNIT * 2)
            })
        })

        describe("increase amount", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).expandBucket(tokenId, DURATION_UNIT)
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT)
                ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
            })

            it("success", async () => {
                const amount = MIN_AMOUNT.mul(2)
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT, { value: MIN_AMOUNT })
                )
                    .to.emit(system.connect(staker), "BucketExpanded")
                    .withArgs(tokenId, amount, DURATION_UNIT)
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.amount).to.equal(amount)
                expect(bucket.duration).to.equal(DURATION_UNIT)
            })
        })

        describe("expand bucket", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0])
            })

            it("not token owner", async () => {
                await expect(
                    system.connect(alice).expandBucket(tokenId, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                ).to.be.revertedWithCustomError(system, "ErrNotOwner")
            })

            it("token unlocked", async () => {
                await system.connect(staker)["unlock(uint256)"](tokenId)
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT * 2, { value: MIN_AMOUNT })
                ).to.be.revertedWithCustomError(system, "ErrNotLockedBucket")
            })

            it("shorter duration", async () => {
                await expect(
                    system.connect(staker).expandBucket(tokenId, DURATION_UNIT * 0.5, { value: MIN_AMOUNT })
                ).to.be.revertedWithCustomError(system, "ErrInvalidDuration")
            })
            it("success", async () => {
                const amount = MIN_AMOUNT.mul(2)
                const duration = DURATION_UNIT * 2
                await expect(
                    system.connect(staker).expandBucket(tokenId, duration, { value: MIN_AMOUNT })
                )
                    .to.emit(system.connect(staker), "BucketExpanded")
                    .withArgs(tokenId, amount, duration)
                const bucket = await system.bucketOf(tokenId)
                expect(bucket.amount).to.equal(amount)
                expect(bucket.duration).to.equal(duration)
            })
        })

        describe("change delegate", () => {
            let tokenId: BigNumber
            beforeEach(async () => {
                tokenId = await createBucket(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0])
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
                await advanceBy(BigNumber.from(DURATION_UNIT))
                await system.connect(staker)["unstake(uint256)"](tokenId)
                await expect(
                    system.connect(staker).changeDelegate(tokenId, DELEGATES[2])
                ).to.be.revertedWithCustomError(system, "ErrNotStakedBucket")
            })
        })

        describe("batch change delegates", () => {
            let tokenIds: BigNumber[]
            beforeEach(async () => {
                tokenIds = await createBuckets(system, staker, MIN_AMOUNT, DURATION_UNIT, DELEGATES[0], 4)
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
