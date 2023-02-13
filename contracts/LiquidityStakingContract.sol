// SPDX-License-Identifier: MIT
pragma solidity >= 0.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityStaking is ERC20, Ownable {

    // TODO: add parameters
    constructor() ERC20("", "") {
        
    }

    // Need discussion: if a user accidently sent some IOTXs to this contract
    //  these IOTXs will be treated as reward. How could we prevent that?
    receive() external payable {
        // TODO: on receive reward, update reward pool balance
    }

    function _claimReward(address payable _account) internal {
        // TODO: claim reward
    }

    function claimReward() external {
        _claimReward(payable(msg.sender));
    }

    function _increaseShares(address _account, uint256 _shares) internal {
        // TODO
    }

    function _decreaseShares(address _account, uint256 _shares) internal {
        // TODO
    }

    // mint stIOTX
    function stake() external payable {
        // TODO: mint & claim reward & update shares
    }

    function unstake(uint256 _bucketId) external {
        // TODO: check balance & claim rewards & update shares & burn stIOTX & transfer ownership of the bucket NFT
    }

    function transfer(address _to, uint256 _amount) public override returns (bool) {
        _transfer(msg.sender, _to, _amount);
        // TODO: claim reward & update shares

        return true;
    }

    function transferFrom(address _from, address _to, uint256 _amount) public override returns (bool) {
        // TODO: check allowance & claim rewards & update shares
        _transfer(_from, _to, _amount);
        return true;
    }

    function createBuckets() public onlyOwner {

    }

    function withdrawReward(address payable _to) public onlyOwner {
        // TODO: withdraw reward to developers
    }

    function adjustRatio(uint8 _ratio) public onlyOwner {
        // TODO: update developer reward ratio
    }

    function changeDelegates(uint256[] calldata _bucketIds, bytes8 _delegate) public onlyOwner {
        // TODO: call system contract to update delegates
    }
}