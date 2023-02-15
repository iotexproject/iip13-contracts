// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {BucketType, SystemStaking} from "../src/SystemStaking.sol";

contract SystemStakingTest is Test {
    event NewBucketType(uint256 amount, uint256 duration);

    SystemStaking public system;

    address internal owner;
    address internal alice;

    function setUp() public {
        vm.prank(owner);
        system = new SystemStaking();
    }

    function testInfo() public {
        assertEq(system.name(), "BucketNFT");
        assertEq(system.symbol(), "BKT");
        assertEq(system.owner(), owner);
        assertEq(system.emergencyWithdrawPenaltyRate(), 100);
    }

    function testSetEmergencyWithdrawPenaltyRate() public {
        assertEq(system.emergencyWithdrawPenaltyRate(), 100);

        vm.prank(owner);
        system.setEmergencyWithdrawPenaltyRate(90);

        assertEq(system.emergencyWithdrawPenaltyRate(), 90);
    }

    function testCannotSetEmergencyWithdrawPenaltyRate() public {
        vm.expectRevert("Ownable: caller is not the owner");
        system.setEmergencyWithdrawPenaltyRate(90);

        vm.expectRevert();
        vm.prank(owner);
        system.setEmergencyWithdrawPenaltyRate(1000);

        assertEq(system.emergencyWithdrawPenaltyRate(), 100);
    }

    function testAddBucketType() public {
        vm.startPrank(owner);

        assertEq(system.numOfBucketTypes(), 0);
        vm.expectEmit(true, false, false, true);
        // The event we expect
        emit NewBucketType(1 ether, 1 days);
        system.addBucketType(1 ether, 1 days);
        assertEq(system.numOfBucketTypes(), 1);
        assertEq(system.isActiveBucketType(1 ether, 1 days), true);

        BucketType[] memory types = system.bucketTypes(0, 1);
        assertEq(types.length, 1);
        assertEq(types[0].amount, 1 ether);
        assertEq(types[0].duration, 1 days);
        assertEq(types[0].activatedAt, block.number);
    }

    function testCannotAddBucketType() public {
        vm.expectRevert("Ownable: caller is not the owner");
        system.addBucketType(1 ether, 1 days);

        vm.startPrank(owner);

        vm.expectRevert("amount is invalid");
        system.addBucketType(0, 1 days);

        system.addBucketType(1 ether, 1 days);

        vm.expectRevert("duplicate bucket type");
        system.addBucketType(1 ether, 1 days);

        assertEq(system.numOfBucketTypes(), 1);
    }
}
