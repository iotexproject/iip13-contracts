// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

struct Bucket {
    uint256 amount;
    uint256 duration;
    uint256 unlockedAt; // UINT256_MAX: in lock
    uint256 unstakedAt; // UINT256_MAX: in stake
    address delegate;
}

error ErrInvalidAmount();
error ErrInvalidDuration();
error ErrInvalidParameter();
error ErrNotUnstakedBucket();
error ErrNotOwner();
error ErrNotReady();
error ErrNotLockedBucket();
error ErrNotStakedBucket();
error ErrTransferFailed();

contract SystemStaking2 is ERC721, Ownable, Pausable {
    uint256 public constant UINT256_MAX = type(uint256).max;
    uint256 public constant ONE_DAY = 17280; // (24 * 60 * 60) / 5;
    uint256 public constant MAX_DURATION = ONE_DAY * 365 * 3;
    uint256 public constant UNSTAKE_FREEZE_BLOCKS = 3 * ONE_DAY;
    uint256 public immutable MIN_AMOUNT; // = 100 ether;

    event Staked(uint256 indexed bucketId, address delegate, uint256 amount, uint256 duration);
    event Locked(uint256 indexed bucketId, uint256 duration);
    event Unlocked(uint256 indexed bucketId);
    event Unstaked(uint256 indexed bucketId);
    event Merged(uint256[] bucketIds, uint256 amount, uint256 duration);
    event BucketExpanded(uint256 indexed bucketId, uint256 amount, uint256 duration);
    event DelegateChanged(uint256 indexed bucketId, address newDelegate);
    event Withdrawal(uint256 indexed bucketId, address indexed recipient);
    event Donated(uint256 indexed bucketId, address indexed beneficiary, uint256 amount);

    modifier onlyBucketOwner(uint256 _bucketId) {
        _assertOnlyBucketOwner(_bucketId);
        _;
    }

    // bucket id
    uint256 private __currBucketId;
    // mapping from bucket ID to bucket info
    mapping(uint256 => Bucket) private __buckets;
    // beneficiary of donation
    address payable public beneficiary;
    //// delegate address -> bucket type -> count
    constructor(uint256 _minAmount, address payable _beneficiary) ERC721("BucketNFT", "BKT") {
        MIN_AMOUNT = _minAmount;
        beneficiary = _beneficiary;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function unsafeInc(uint256 x) private pure returns (uint256) {
        unchecked {
            return x + 1;
        }
    }

    function unsafeDec(uint256 x) private pure returns (uint256) {
        unchecked {
            return x - 1;
        }
    }

    function blocksToUnstake(uint256 _bucketId) external view returns (uint256) {
        _assertOnlyValidBucket(_bucketId);
        Bucket storage bucket = __buckets[_bucketId];
        _assertInStake(bucket.unstakedAt);
        return _blocksToUnstake(bucket.unlockedAt, bucket.duration);
    }

    function blocksToWithdraw(uint256 _bucketId) external view returns (uint256) {
        _assertOnlyValidBucket(_bucketId);
        return _blocksToWithdraw(__buckets[_bucketId].unstakedAt);
    }

    function bucketOf(uint256 _bucketId) external view returns (Bucket memory) {
        _assertOnlyValidBucket(_bucketId);
        return __buckets[_bucketId];
    }

    function stake(
        uint256 _duration,
        address _delegate
    ) external payable whenNotPaused returns (uint256) {
        uint256 msgValue = msg.value;
        _assertAmount(msgValue);
        _assertDuration(_duration);

        return _stake(msgValue, _duration, _delegate);
    }

    function stake(
        uint256 _amount,
        uint256 _duration,
        address[] memory _delegates
    ) external payable whenNotPaused returns (uint256[] memory bucketIds_) {
        _assertAmount(_amount);
        _assertDuration(_duration);
        if (_amount * _delegates.length != msg.value) {
            revert ErrInvalidAmount();
        }
        bucketIds_ = new uint256[](_delegates.length);
        for (uint256 i = 0; i < _delegates.length; i = unsafeInc(i)) {
            bucketIds_[i] = _stake(_amount, _duration, _delegates[i]);
        }
    }

    function stake(
        uint256 _amount,
        uint256 _duration,
        address _delegate,
        uint256 _count
    ) external payable whenNotPaused returns (uint256[] memory bucketIds_) {
        _assertAmount(_amount);
        _assertDuration(_duration);
        if (_amount * _count != msg.value) {
            revert ErrInvalidAmount();
        }
        bucketIds_ = new uint256[](_count);
        for (uint256 i = 0; i < _count; i = unsafeInc(i)) {
            bucketIds_[i] = _stake(_amount, _duration, _delegate);
        }
    }

    function unlock(uint256 _bucketId) external whenNotPaused {
        _unlock(_bucketId);
    }

    function unlock(uint256[] calldata _bucketIds) external whenNotPaused {
        for (uint256 i = 0; i < _bucketIds.length; i = unsafeInc(i)) {
            _unlock(_bucketIds[i]);
        }
    }

    function lock(
        uint256 _bucketId,
        uint256 _duration
    ) external whenNotPaused {
        _assertDuration(_duration);
        _lock(_bucketId, _duration);
    }

    function lock(uint256[] calldata _bucketIds, uint256 _duration) external whenNotPaused {
        _assertDuration(_duration);
        for (uint256 i = 0; i < _bucketIds.length; i = unsafeInc(i)) {
            _lock(_bucketIds[i], _duration);
        }
    }

    function unstake(uint256 _bucketId) external whenNotPaused {
        _unstake(_bucketId);
    }

    function unstake(uint256[] calldata _bucketIds) external whenNotPaused {
        for (uint256 i = 0; i < _bucketIds.length; i = unsafeInc(i)) {
            _unstake(_bucketIds[i]);
        }
    }

    function withdraw(
        uint256 _bucketId,
        address payable _recipient
    ) external whenNotPaused onlyBucketOwner(_bucketId) {
        _withdraw(_bucketId, _recipient);
    }

    function withdraw(
        uint256[] calldata _bucketIds,
        address payable _recipient
    ) external whenNotPaused {
        for (uint256 i = 0; i < _bucketIds.length; i = unsafeInc(i)) {
            _withdraw(_bucketIds[i], _recipient);
        }
    }

    function merge(
        uint256[] calldata bucketIds,
        uint256 _newDuration
    ) external payable whenNotPaused {
        if (bucketIds.length <= 1) {
            revert ErrInvalidParameter();
        }
        _assertDuration(_newDuration);
        uint256 amount = msg.value;
        uint256 bucketId;
        Bucket storage bucket;
        for (uint256 i = bucketIds.length; i > 0; ) {
            i = unsafeDec(i);
            bucketId = bucketIds[i];
            _assertOnlyBucketOwner(bucketId);
            bucket = __buckets[bucketId];
            _assertInStake(bucket.unstakedAt);
            if (_newDuration < _blocksToUnstake(bucket.unlockedAt, bucket.duration)) {
                revert ErrInvalidDuration();
            }
            amount += bucket.amount;
            if (i != 0) {
                _burn(bucketId);
            } else {
                bucket.unlockedAt = UINT256_MAX;
                bucket.amount = amount;
                bucket.duration = _newDuration;
                emit Merged(bucketIds, amount, _newDuration);
            }
        }
    }

    function expandBucket(
        uint256 _bucketId,
        uint256 _newDuration
    ) external payable whenNotPaused onlyBucketOwner(_bucketId) {
        _assertDuration(_newDuration);
        Bucket storage bucket = __buckets[_bucketId];
        // TODO: review whether unlocked tokens could be expanded
        // _assertInStake(bucket);
        // if (_newDuration < _blocksToUnstake(bucket.unlockedAt, bucket.duration)) {
        //     revert ErrInvalidDuration();
        // }
        _assertInLock(bucket.unlockedAt);
        if (_newDuration < bucket.duration) {
            revert ErrInvalidDuration();
        }
        bucket.amount += msg.value;
        bucket.duration = _newDuration;
        emit BucketExpanded(_bucketId, bucket.amount, _newDuration);
    }

    function deposit(
        uint256 _bucketId
    ) external payable whenNotPaused {
        Bucket storage bucket = __buckets[_bucketId];
        _assertInLock(bucket.unlockedAt);
        bucket.amount += msg.value;
        emit BucketExpanded(_bucketId, bucket.amount, bucket.duration);
    }

    function changeDelegate(
        uint256 _bucketId,
        address _delegate
    ) external whenNotPaused {
        _changeDelegate(_bucketId, _delegate);
    }

    function changeDelegates(
        uint256[] calldata _bucketIds,
        address _delegate
    ) external whenNotPaused {
        for (uint256 i = 0; i < _bucketIds.length; i = unsafeInc(i)) {
            _changeDelegate(_bucketIds[i], _delegate);
        }
    }

    function donate(uint256 _bucketId, uint256 _amount) external onlyBucketOwner(_bucketId) {
        Bucket storage bucket = __buckets[_bucketId];
        _assertInStake(bucket.unstakedAt);
        if (bucket.amount < _amount || _amount == 0) {
            revert ErrInvalidAmount();
        }
        bucket.amount -= _amount;
        _safeTransfer(beneficiary, _amount);
        emit Donated(_bucketId, beneficiary, _amount);
    }

    /////////////////////////////////////////////
    // Private Functions
    function _safeTransfer(address payable _recipient, uint256 _amount) internal {
        (bool success, ) = _recipient.call{value: _amount}("");
        if (!success) {
            revert ErrTransferFailed();
        }
    }

    function _isTriggered(uint256 _value) internal pure returns (bool) {
        return _value != UINT256_MAX;
    }

    function _assertAmount(uint256 _amount) internal view {
        if (_amount < MIN_AMOUNT) {
            revert ErrInvalidAmount();
        }
    }

    function _assertDuration(uint256 _duration) internal pure {
        if ((_duration % ONE_DAY) != 0 || _duration > MAX_DURATION) {
            revert ErrInvalidDuration();
        }
    }

    function _assertOnlyBucketOwner(uint256 _bucketId) internal view {
        if (msg.sender != ownerOf(_bucketId)) {
            revert ErrNotOwner();
        }
    }

    function _assertInLock(uint256 _unlockedAt) internal pure {
        if (_isTriggered(_unlockedAt)) {
            revert ErrNotLockedBucket();
        }
    }

    function _assertInStake(uint256 _unstakedAt) internal pure {
        if (_isTriggered(_unstakedAt)) {
            revert ErrNotStakedBucket();
        }
    }

    function _assertOnlyValidBucket(uint256 _bucketId) internal view {
        require(_exists(_bucketId), "ERC721: invalid token ID");
    }

    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _firstTokenId,
        uint256 _batchSize
    ) internal override {
        super._beforeTokenTransfer(_from, _to, _firstTokenId, _batchSize);
    }

    function _blocksToWithdraw(uint256 _unstakedAt) internal view returns (uint256) {
        if (!_isTriggered(_unstakedAt)) {
            revert ErrNotUnstakedBucket();
        }
        uint256 withdrawBlock = _unstakedAt + UNSTAKE_FREEZE_BLOCKS;
        if (withdrawBlock <= block.number) {
            return 0;
        }

        unchecked {
            return withdrawBlock - block.number;
        }
    }

    function _blocksToUnstake(uint256 _unlockedAt, uint256 _duration) internal view returns (uint256) {
        if (!_isTriggered(_unlockedAt)) {
            return _duration;
        }
        uint256 unstakeBlock = _unlockedAt + _duration;
        if (unstakeBlock <= block.number) {
            return 0;
        }
        unchecked {
            return unstakeBlock - block.number;
        }
    }

    function _stake(uint256 _amount, uint256 _duration, address _delegate) internal returns (uint256) {
        uint256 bucketId = __currBucketId = unsafeInc(__currBucketId);
        __buckets[bucketId] = Bucket(_amount, _duration, UINT256_MAX, UINT256_MAX, _delegate);
        _safeMint(msg.sender, bucketId);
        emit Staked(bucketId, _delegate, _amount, _duration);
        return bucketId;
    }

    function _unlock(uint256 _bucketId) internal onlyBucketOwner(_bucketId)  {
        Bucket storage bucket = __buckets[_bucketId];
        _assertInLock(bucket.unlockedAt);
        bucket.unlockedAt = block.number;
        emit Unlocked(_bucketId);
    }

    function _lock(uint256 _bucketId, uint256 _duration) internal onlyBucketOwner(_bucketId) {
        Bucket storage bucket = __buckets[_bucketId];
        _assertInStake(bucket.unstakedAt);
        if (_duration < _blocksToUnstake(bucket.unlockedAt, bucket.duration)) {
            revert ErrInvalidDuration();
        }
        bucket.unlockedAt = UINT256_MAX;
        emit Locked(_bucketId, _duration);
    }

    function _unstake(uint256 _bucketId) internal onlyBucketOwner(_bucketId) {
        Bucket storage bucket = __buckets[_bucketId];
        _assertInStake(bucket.unstakedAt);
        if (_blocksToUnstake(bucket.unlockedAt, bucket.duration) != 0) {
            revert ErrNotReady();
        }
        bucket.unlockedAt = block.number;
        bucket.unstakedAt = block.number;
        emit Unstaked(_bucketId);
    }

    function _withdraw(uint256 _bucketId, address payable _recipient) internal onlyBucketOwner(_bucketId) {
        Bucket storage bucket = __buckets[_bucketId];
        if (_blocksToWithdraw(bucket.unstakedAt) != 0) {
            revert ErrNotReady();
        }
        _burn(_bucketId);
        _safeTransfer(_recipient, bucket.amount);
        emit Withdrawal(_bucketId, _recipient);
    }

    function _changeDelegate(uint256 _bucketId, address _newDelegate) internal onlyBucketOwner(_bucketId) {
        Bucket storage _bucket = __buckets[_bucketId];
        _assertInStake(_bucket.unstakedAt);
        if (_bucket.delegate == _newDelegate) {
            revert ErrInvalidParameter();
        }
        _bucket.delegate = _newDelegate;
        emit DelegateChanged(_bucketId, _newDelegate);
    }
}
