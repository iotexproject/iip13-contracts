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
    address[] internal delegates10;
    address[] internal delegates20;
    address[] internal delegates50;
    address[] internal delegates100;
    address[] internal delegates200;
    address[] internal delegates500;
    address[] internal delegates1000;
    uint256[] internal tokenIds10;
    uint256[] internal tokenIds20;
    uint256[] internal tokenIds50;
    uint256[] internal tokenIds100;
    uint256[] internal tokenIds200;
    uint256[] internal tokenIds500;
    uint256[] internal tokenIds1000;

    function setUp() public {
        owner = vm.addr(0x1);
        alice = vm.addr(0x2);
        delegates10 = new address[](10);
        delegates20 = new address[](20);
        delegates50 = new address[](50);
        delegates100 = new address[](100);
        delegates200 = new address[](200);
        delegates500 = new address[](500);
        delegates1000 = new address[](1000);

        tokenIds10 = new uint256[](10);
        tokenIds20 = new uint256[](20);
        tokenIds50 = new uint256[](50);
        tokenIds100 = new uint256[](100);
        tokenIds200 = new uint256[](200);
        tokenIds500 = new uint256[](500);
        tokenIds1000 = new uint256[](1000);

        vm.startPrank(owner);
        system = new SystemStaking();

        // prepare bucket types
        for (uint24 i = 1; i <= 10; i++) {
            system.addBucketType(1 ether, i * 1 days);
        }
        vm.stopPrank();

        vm.startPrank(alice);
        vm.deal(alice, 20000 ether);
        for (uint24 i = 0; i < 1000; i++) {
            address delegate = vm.addr(0x3 + i);
            if (i < 10) {
                delegates10[i] = delegate;
                tokenIds10[i] = i + 1;
            }
            if (i < 20) {
                delegates20[i] = delegate;
                tokenIds20[i] = i + 1;
            }
            if (i < 50) {
                delegates50[i] = delegate;
                tokenIds50[i] = i + 1;
            }
            if (i < 100) {
                delegates100[i] = delegate;
                tokenIds100[i] = i + 1;
            }
            if (i < 200) {
                delegates200[i] = delegate;
                tokenIds200[i] = i + 1;
            }
            if (i < 500) {
                delegates500[i] = delegate;
                tokenIds500[i] = i + 1;
            }
            tokenIds1000[i] = i + 1;
            delegates1000[i] = delegate;

            for (uint j = 1; j < 11; j++) {
                system.stake{value: 1 ether}(j * 1 days, delegate);
            }
        }
    }

    function testStake10InBatchGas() public {
        system.stake{value: 10 ether}(1 ether, 1 days, delegates10);
    }

    function testStake20InBatchGas() public {
        system.stake{value: 20 ether}(1 ether, 1 days, delegates20);
    }

    function testStake50InBatchGas() public {
        system.stake{value: 50 ether}(1 ether, 1 days, delegates50);
    }

    function testStake100InBatchGas() public {
        system.stake{value: 100 ether}(1 ether, 1 days, delegates100);
    }

    function testStake200InBatchGas() public {
        system.stake{value: 200 ether}(1 ether, 1 days, delegates200);
    }

    function testStake500InBatchGas() public {
        system.stake{value: 500 ether}(1 ether, 1 days, delegates500);
    }

    function testStake1000InBatchGas() public {
        system.stake{value: 1000 ether}(1 ether, 1 days, delegates1000);
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

    function testChange10Delegates() public {
        system.changeDelegates(tokenIds10, delegates1000[999]);
    }

    function testChange20Delegates() public {
        system.changeDelegates(tokenIds20, delegates1000[999]);
    }

    function testChange50Delegates() public {
        system.changeDelegates(tokenIds50, delegates1000[999]);
    }

    function testChange100Delegates() public {
        system.changeDelegates(tokenIds100, delegates1000[999]);
    }

    function testChange200Delegates() public {
        system.changeDelegates(tokenIds200, delegates1000[999]);
    }

    function testChange500Delegates() public {
        system.changeDelegates(tokenIds500, delegates1000[999]);
    }

    function testChange1000Delegates() public {
        system.changeDelegates(tokenIds1000, delegates1000[999]);
    }
}
