// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import {BucketType, SystemStaking} from "../src/SystemStaking.sol";

contract SystemStakingGasTest is Test {
    event NewBucketType(uint256 amount, uint256 duration, bool autoStaking);

    SystemStaking public system;

    address internal owner;
    address internal alice;
    bytes12[] internal delegates10;
    bytes12[] internal delegates20;
    bytes12[] internal delegates50;
    bytes12[] internal delegates100;
    bytes12[] internal delegates200;
    bytes12[] internal delegates500;
    bytes12[] internal delegates1000;

    function setUp() public {
        owner = vm.addr(0x1);
        alice = vm.addr(0x2);
        delegates10 = new bytes12[](10);
        delegates20 = new bytes12[](20);
        delegates50 = new bytes12[](50);
        delegates100 = new bytes12[](100);
        delegates200 = new bytes12[](200);
        delegates500 = new bytes12[](500);
        delegates1000 = new bytes12[](1000);

        vm.startPrank(owner);
        system = new SystemStaking();

        // prepare bucket types
        system.addBucketType(1 ether, 1 days);
        system.addBucketType(1 ether, 2 days);
        system.addBucketType(1 ether, 3 days);
        system.addBucketType(1 ether, 4 days);
        system.addBucketType(1 ether, 5 days);
        system.addBucketType(1 ether, 6 days);
        system.addBucketType(1 ether, 7 days);
        system.addBucketType(1 ether, 8 days);
        system.addBucketType(1 ether, 9 days);
        system.addBucketType(1 ether, 10 days);
        vm.stopPrank();

        vm.startPrank(alice);
        vm.deal(alice, 10000 ether);
        for (uint24 i = 0; i < 1000; i++) {
            bytes12 delegate = bytes12(bytes(abi.encodePacked("delegate_", i)));
            if (i < 10) {
                delegates10[i] = delegate;
            }
            if (i < 20) {
                delegates20[i] = delegate;
            }
            if (i < 50) {
                delegates50[i] = delegate;
            }
            if (i < 100) {
                delegates100[i] = delegate;
            }
            if (i < 200) {
                delegates200[i] = delegate;
            }
            if (i < 500) {
                delegates500[i] = delegate;
            }
            delegates1000[i] = delegate;

            for (uint j = 1; j < 11; j++) {
                system.stake{value: 1 ether}(j * 1 days, delegate);
            }
        }
        vm.deal(alice, 10000 ether);
    }

    function testStake10InBatchGas() public {
        system.stake{value: 10 ether}(
            1 ether,
            1 days,
            delegates10
        );
    }

    function testStake20InBatchGas() public {
        system.stake{value: 20 ether}(
            1 ether,
            1 days,
            delegates20
        );
    }

    function testStake50InBatchGas() public {
        system.stake{value: 50 ether}(
            1 ether,
            1 days,
            delegates50
        );
    }

    function testStake100InBatchGas() public {
        system.stake{value: 100 ether}(
            1 ether,
            1 days,
            delegates100
        );
    }

    function testStake200InBatchGas() public {
        system.stake{value: 200 ether}(
            1 ether,
            1 days,
            delegates200
        );
    }

    function testStake500InBatchGas() public {
        system.stake{value: 500 ether}(
            1 ether,
            1 days,
            delegates500
        );
    }

    function testStake1000InBatchGas() public {
        system.stake{value: 1000 ether}(
            1 ether,
            1 days,
            delegates1000
        );
    }

    function testGasFor10Delegates() public view {
        system.lockedVotesTo(delegates10);
    }

    function testGasFor20Delegates() public view {
        system.lockedVotesTo(delegates20);
    }

    function testGasFor50Delegates() public view {
        system.lockedVotesTo(delegates50);
    }

    function testGasFor100Delegates() public view {
        system.lockedVotesTo(delegates100);
    }

    function testGasFor200Delegates() public view {
        system.lockedVotesTo(delegates200);
    }

    function testGasFor500Delegates() public view {
        system.lockedVotesTo(delegates500);
    }

    function testGasFor1000Delegates() public view {
        system.lockedVotesTo(delegates1000);
    }

    function test10BucketTypeFor1000() public {
        uint256[][] memory votes = system.lockedVotesTo(delegates1000);

        assertEq(votes.length, 1000);
        for (uint i = 0; i < votes.length; i++) {
            assertEq(votes[i].length, 10);
            for (uint j = 0; j < votes[i].length; j++) {
                assertEq(votes[i][j], 1);
            }
        }
    }

    // TODO (chenchen): test change delegates in batch
}
