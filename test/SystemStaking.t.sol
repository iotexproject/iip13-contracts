// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {SystemStaking} from "../src/SystemStaking.sol";

contract SystemStakingTest is Test {
    SystemStaking public system;

    function setUp() public {
        system = new SystemStaking();
    }

    function testInfo() public {
        assertEq(system.name(), "BucketNFT");
        assertEq(system.symbol(), "BKT");
    }
}
