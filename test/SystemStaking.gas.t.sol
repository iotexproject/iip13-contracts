// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import {BucketType, SystemStaking} from "../src/SystemStaking.sol";

contract SystemStakingGasTest is Test {
    event NewBucketType(uint256 amount, uint256 duration);

    SystemStaking public system;

    address internal owner;
    address internal alice;

    function setUp() public {
        owner = vm.addr(0x1);
        alice = vm.addr(0x2);

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
            for (uint j = 1; j < 11; j++) {
                system.stake{value: 1 ether}(j * 1 days, delegate);
            }
        }
    }

    function test_gas_10BucketType_1000Delegates() public {
        bytes12[] memory delegates = new bytes12[](1000);
        for (uint24 i = 0; i < 1000; i++) {
            delegates[i] = bytes12(bytes(abi.encodePacked("delegate_", i)));
        }
        uint256[][] memory votes = system.votesTo(delegates);

        assertEq(votes.length, 1000);
        for (uint i = 0; i < votes.length; i++) {
            assertEq(votes[i].length, 10);
            for (uint j = 0; j < votes[i].length; j++) {
                assertEq(votes[i][j], 1);
            }
        }
    }
}
