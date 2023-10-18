// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

struct BucketInfo {
    uint256 typeIndex;
    uint256 unlockedAt; // UINT256_MAX: in lock
    uint256 unstakedAt; // UINT256_MAX: in stake
    address delegate;
}

struct BucketType {
    uint256 amount;
    uint256 duration;
    uint256 activatedAt;
}

interface ISystemStaking {

    /* Pausable interface */
    
    event Paused(address account);
    event Unpaused(address account);
    function paused() external view returns (bool);
    function pause() external;
    function unpause() external;

    /* Ownable interface */

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;

    /* ERC721 interface */

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    function balanceOf(address owner) external view returns (uint256 balance);
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool _approved) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function isApprovedForAll(address owner, address operator) external view returns (bool);

    /* SystemStaking Interface */

    event BucketTypeActivated(uint256 amount, uint256 duration);
    event BucketTypeDeactivated(uint256 amount, uint256 duration);
    event Staked(uint256 indexed tokenId, address delegate, uint256 amount, uint256 duration);
    event Locked(uint256 indexed tokenId, uint256 duration);
    event Unlocked(uint256 indexed tokenId);
    event Unstaked(uint256 indexed tokenId);
    event Merged(uint256[] tokenIds, uint256 amount, uint256 duration);
    event BucketExpanded(uint256 indexed tokenId, uint256 amount, uint256 duration);
    event DelegateChanged(uint256 indexed tokenId, address newDelegate);
    event Withdrawal(uint256 indexed tokenId, address indexed recipient);

    function pause() external; 
    function unpause() external;

    // Bucket type related functions
    function addBucketType(uint256 _amount, uint256 _duration) external;
    function deactivateBucketType(uint256 _amount, uint256 _duration) external;
    function activateBucketType(uint256 _amount, uint256 _duration) external;
    function isActiveBucketType(uint256 _amount, uint256 _duration) external view returns (bool);
    function numOfBucketTypes() external view returns (uint256);
    function bucketTypes(uint256 _offset, uint256 _size) external view returns (BucketType[] memory);

    // Token related functions
    function blocksToUnstake(uint256 _tokenId) external view returns (uint256);
    function blocksToWithdraw(uint256 _tokenId) external view returns (uint256);
    function bucketOf(uint256 _tokenId) external view returns (uint256, uint256, uint256, uint256, address);
    function stake(uint256 _duration, address _delegate) external payable returns (uint256);
    function stake(uint256 _amount, uint256 _duration, address[] memory _delegates) external payable returns (uint256);
    function stake(uint256 _amount, uint256 _duration, address _delegate, uint256 _count) external payable returns (uint256);
    function unlock(uint256 _tokenId) external;
    function unlock(uint256[] calldata _tokenIds) external;
    function lock(uint256 _tokenId, uint256 _duration) external;
    function lock(uint256[] calldata _tokenIds, uint256 _duration) external;
    function unstake(uint256 _tokenId) external;
    function unstake(uint256[] calldata _tokenIds) external;
    function withdraw(uint256 _tokenId, address payable _recipient) external;
    function withdraw(uint256[] calldata _tokenIds, address payable _recipient) external;
    function merge(uint256[] calldata tokenIds, uint256 _newDuration) external payable;
    function expandBucket(uint256 _tokenId, uint256 _newAmount, uint256 _newDuration) external payable;
    function changeDelegate(uint256 _tokenId, address _delegate) external;
    function changeDelegates(uint256[] calldata _tokenIds, address _delegate) external;
    function lockedVotesTo(address[] calldata _delegates) external view returns (uint256[][] memory counts_);
    function unlockedVotesTo(address[] calldata _delegates) external view returns (uint256[][] memory counts_);
}
