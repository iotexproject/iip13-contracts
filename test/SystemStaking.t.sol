// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {BucketType, SystemStaking} from "../src/SystemStaking.sol";

contract SystemStakingTest is Test {
    event BucketTypeActivated(uint256 amount, uint256 duration);

    SystemStaking public system;

    address internal owner;
    address internal alice;
    address internal bob;

    function setUp() public {
        owner = vm.addr(0x1);
        vm.deal(owner, 10000 ether);
        alice = vm.addr(0x2);
        vm.deal(alice, 10000 ether);
        bob = vm.addr(0x3);
        vm.deal(bob, 10000 ether);

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
        vm.expectRevert("invalid penalty rate");
        system.setEmergencyWithdrawPenaltyRate(1000);

        assertEq(system.emergencyWithdrawPenaltyRate(), 100);
    }

    function testaddBucketType() public {
        vm.startPrank(owner);

        assertEq(system.numOfBucketTypes(), 0);
        vm.expectEmit(true, false, false, true);
        // The event we expect
        emit BucketTypeActivated(1 ether, 1 days);
        system.addBucketType(1 ether, 1 days);
        assertEq(system.numOfBucketTypes(), 1);
        assertEq(system.isActiveBucketType(1 ether, 1 days), true);
        assertEq(system.isActiveBucketType(1 ether, 1 days), true);

        BucketType[] memory types = system.bucketTypes(0, 1);
        assertEq(types.length, 1);
        assertEq(types[0].amount, 1 ether);
        assertEq(types[0].duration, 1 days);
        assertEq(types[0].activatedAt, block.number);
    }

    function testCannotaddBucketType() public {
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

    function testStakeMultiple() public {
        vm.startPrank(owner);
        system.addBucketType(1 ether, 1 days);
        system.addBucketType(2 ether, 1 days);
        system.addBucketType(3 ether, 1 days);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.startPrank(alice);

        bytes12 delegate = bytes12(bytes(abi.encodePacked("delegate")));

        bytes12[] memory delegates = new bytes12[](3);
        delegates[0] = delegate;
        delegates[1] = delegate;
        delegates[2] = delegate;

        system.stake{value: 3 ether}(1 ether, 1 days, delegates);
        system.stake{value: 6 ether}(2 ether, 1 days, delegates);
        system.stake{value: 9 ether}(3 ether, 1 days, delegates);

        system.stake{value: 1 ether}(1 days, delegate);
    }

    function testStakeFullflow() public {
        vm.startPrank(owner);
        system.addBucketType(1 ether, 1 days);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.startPrank(alice);

        bytes12 delegate = bytes12(bytes(abi.encodePacked("delegate")));

        uint256 tokenId = system.stake{value: 1 ether}(1 days, delegate);
        assertEq(tokenId, 1);
        assertEq(alice, system.ownerOf(tokenId));

        vm.expectRevert("not an unstaked bucket");
        system.withdraw(tokenId, payable(alice));

        system.transferFrom(alice, bob, tokenId);
        assertEq(bob, system.ownerOf(tokenId));

        vm.stopPrank();

        vm.expectRevert("not owner");
        system.withdraw(tokenId, payable(alice));

        vm.expectRevert("not owner");
        system.unstake(tokenId);

        vm.prank(bob);
        system.approve(alice, tokenId);

        vm.startPrank(alice);
        system.transferFrom(bob, alice, tokenId);
        system.unlock(tokenId);

        vm.expectRevert("not a locked token");
        system.unlock(tokenId);

        vm.expectRevert("not ready to unstake");
        system.unstake(tokenId);
    }

    function testDeactivateBucketType() public {
        vm.prank(owner);
        system.addBucketType(1 ether, 1 days);
        assertEq(system.isActiveBucketType(1 ether, 1 days), true);
        assertEq(system.isActiveBucketType(1 ether, 1 days), true);

        bytes12 delegate = bytes12(bytes(abi.encodePacked("delegate")));

        vm.prank(alice);
        uint256 tokenId = system.stake{value: 1 ether}(1 days, delegate);
        assertEq(tokenId, 1);
        assertEq(alice, system.ownerOf(tokenId));

        vm.prank(owner);
        system.deactivateBucketType(1 ether, 1 days);
        assertEq(system.numOfBucketTypes(), 1);
        assertEq(system.isActiveBucketType(1 ether, 1 days), false);
        assertEq(system.isActiveBucketType(1 ether, 1 days), false);

        vm.prank(alice);
        vm.expectRevert("inactive bucket type");
        system.stake{value: 1 ether}(1 days, delegate);
    }
}
