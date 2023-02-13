// SPDX-License-Identifier: MIT
pragma solidity >= 0.8;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

struct Delegate {
    bytes8 name;
    uint16 rank;
    uint256 votes;
    uint8 typ;
    uint16 probationRate;
    uint16 epochPercent;
    uint16 blockPercent;
    uint16 foundationPercent;
}

struct BucketInfo {
    uint256 bucketType;
    uint256 unstakedAt;
    bytes8 delegate;
}

struct BucketType {
    uint256 amount;
    uint256 duration;
    uint256 activatedAt;
}

contract StakingContract is ERC721, Ownable, Pausable {
    event NewBucketType(uint256 amount, uint256 duration);
    // Mapping from token ID to bucket
    mapping(uint256 => BucketInfo) private __buckets;
    // delegate name -> bucket type -> count
    mapping(bytes8 => mapping(uint256 => uint256)) private __votes;
    BucketType[] private __types;
    // amount -> duration -> index
    mapping(uint256 => mapping(uint256 => uint256)) private __typeIndice;

    constructor() ERC721("", "") {
        __types.push(BucketType(0, 0, type(uint256).max));
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function addBucketType(uint256 _amount, uint256 _duration) public onlyOwner {
        require(_amount != 0, "amount is invalid");
        // TODO: check duplication
        __typeIndice[_amount][_duration] = __types.length;
        __types.push(BucketType(_amount, _duration, block.number));
        // TODO: add to reverseTypes
        emit NewBucketType(_amount, _duration);
    }

    function deactivateBucketType(uint256 _index) public onlyOwner {
        // TODO: check range
        __types[_index + 1].activatedAt = type(uint256).max;
        // TODO: emit event
    }

    function activateBucketType(uint256 _index) public onlyOwner {
        // TODO: check range
        __types[_index + 1].activatedAt = block.number;
        // TODO: emit event
    }

    function numOfBucketTypes() external view returns (uint256) {
        return __types.length - 1;
    }

    function bucketTypes(uint256 _offset, uint256 _size) external view returns (BucketType[] memory) {
        // TODO: check range
        return __types;
    }

    function stake(uint256 _duration, bytes8 _delegate) payable external returns (uint256) {
        // TODO: check index
        require(__types[__typeIndice[msg.value][_duration]].activatedAt <= block.number);
        // TODO: check bucket type
        // TODO: mint & set feature
    
        return 0;
    }

    function unstake(uint256 _bucketId) external {
        // TODO: check range and set unstakedAt
    }

    function changeDelegate(uint256 _bucketId, bytes8 _delegate) public {
        // TODO: check ownership
        // TODO: check activation
        __buckets[_bucketId].delegate = _delegate;
        // TODO: emit event
    }

    function changeDelegates(uint256[] calldata _bucketIds, bytes8 _delegate) public {
        // TODO
    }

    // TODO: read votes to delegates in batch?
    function votesTo(bytes8 _delegate) external view returns (uint256[] memory counts_) {
        counts_ = new uint256[](__types.length - 1);
        mapping(uint256 => uint256) storage votes = __votes[_delegate];
        for (uint256 i = 1; i <= __types.length; i++) {
            counts_[i - 1] = votes[i];
        }
        return counts_;
    }

}
