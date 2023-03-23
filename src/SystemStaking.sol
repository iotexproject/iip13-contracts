// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

struct BucketInfo {
    uint256 typeIndex;
    uint256 unlockedAt; // UINT256_MAX: in lock
    uint256 unstakedAt; // UINT256_MAX: in stake
    bytes12 delegate;
}

struct BucketType {
    uint256 amount;
    uint256 duration;
    uint256 activatedAt;
}

contract SystemStaking is ERC721, Ownable, Pausable {
    uint256 public constant UINT256_MAX = type(uint256).max;

    event BucketTypeActivated(uint256 amount, uint256 duration);
    event BucketTypeDeactivated(uint256 amount, uint256 duration);
    event Staked(uint256 indexed tokenId, bytes12 delegate, uint256 amount, uint256 duration);
    event Locked(uint256 indexed tokenId, uint256 duration);
    event Unlocked(uint256 indexed tokenId);
    event Unstaked(uint256 indexed tokenId);
    event Merged(uint256[] indexed tokenIds, uint256 amount, uint256 duration);
    event DurationExtended(uint256 indexed tokenId, uint256 duration);
    event AmountIncreased(uint256 indexed tokenId, uint256 amount);
    event DelegateChanged(uint256 indexed tokenId, bytes12 newDelegate);
    event Withdrawal(uint256 indexed tokenId, address indexed recipient);
    event EmergencyWithdrawal(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 penaltyFee
    );
    event FeeWithdrawal(address indexed recipient, uint256 amount);
    event EmergencyWithdrawPenaltyRateUpdated(uint256 rate);

    modifier onlyTokenOwner(uint256 _tokenId) {
        _assertOnlyTokenOwner(_tokenId);
        _;
    }

    // token id
    uint256 private __nextTokenId;
    // mapping from token ID to bucket
    mapping(uint256 => BucketInfo) private __buckets;
    // delegate name -> bucket type -> count
    mapping(bytes12 => mapping(uint256 => uint256)) private __unlockedVotes;
    // delegate name -> bucket type -> count
    mapping(bytes12 => mapping(uint256 => uint256)) private __lockedVotes;
    // bucket type
    BucketType[] private __bucketTypes;
    // amount -> duration -> index
    mapping(uint256 => mapping(uint256 => uint256)) private __bucketTypeIndices;
    // emergency withdraw penalty rate
    uint256 private __emergencyWithdrawPenaltyRate;
    // accumulated fee for emergency withdraw
    uint256 private __accumulatedWithdrawFee;

    constructor() ERC721("BucketNFT", "BKT") {
        __nextTokenId = 1;
        _setEmergencyWithdrawPenaltyRate(100);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // emergency withdraw functions
    function withdrawFee(uint256 _amount, address payable _recipient) external onlyOwner {
        __accumulatedWithdrawFee -= _amount;
        _recipient.transfer(_amount);
        emit FeeWithdrawal(_recipient, _amount);
    }

    function setEmergencyWithdrawPenaltyRate(uint256 _rate) external onlyOwner {
        _setEmergencyWithdrawPenaltyRate(_rate);
    }

    function emergencyWithdrawPenaltyRate() external view returns (uint256) {
        return __emergencyWithdrawPenaltyRate;
    }

    function accumulatedWithdrawFee() external view returns (uint256) {
        return __accumulatedWithdrawFee;
    }

    // bucket type related functions
    function addBucketType(uint256 _amount, uint256 _duration) external onlyOwner {
        require(_amount != 0, "amount is invalid");
        require(__bucketTypeIndices[_amount][_duration] == 0, "duplicate bucket type");
        __bucketTypes.push(BucketType(_amount, _duration, block.number));
        __bucketTypeIndices[_amount][_duration] = __bucketTypes.length;
        emit BucketTypeActivated(_amount, _duration);
    }

    function deactivateBucketType(uint256 _amount, uint256 _duration) external onlyOwner {
        __bucketTypes[_bucketTypeIndex(_amount, _duration)].activatedAt = UINT256_MAX;
        emit BucketTypeDeactivated(_amount, _duration);
    }

    function activateBucketType(uint256 _amount, uint256 _duration) external onlyOwner {
        __bucketTypes[_bucketTypeIndex(_amount, _duration)].activatedAt = block.number;
        emit BucketTypeActivated(_amount, _duration);
    }

    function isActiveBucketType(uint256 _amount, uint256 _duration) external view returns (bool) {
        return _isActiveBucketType(_bucketTypeIndex(_amount, _duration));
    }

    function numOfBucketTypes() public view returns (uint256) {
        return __bucketTypes.length;
    }

    function bucketTypes(
        uint256 _offset,
        uint256 _size
    ) external view returns (BucketType[] memory types_) {
        require(_size > 0 && _offset + _size <= numOfBucketTypes(), "invalid parameters");
        types_ = new BucketType[](_size);
        for (uint256 i = 0; i < _size; i++) {
            types_[i] = __bucketTypes[_offset + i];
        }
    }

    // token related functions
    function blocksToUnstake(uint256 _tokenId) external view returns (uint256) {
        _assertOnlyValidToken(_tokenId);
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyStakedToken(bucket);
        return _blocksToUnstake(bucket);
    }

    function blocksToWithdraw(uint256 _tokenId) public view returns (uint256) {
        _assertOnlyValidToken(_tokenId);
        return _blocksToWithdraw(__buckets[_tokenId].unstakedAt);
    }

    function bucketOf(
        uint256 _tokenId
    )
        external
        view
        returns (
            uint256 amount_,
            uint256 duration_,
            uint256 unlockedAt_,
            uint256 unstakedAt_,
            bytes12 delegate_
        )
    {
        _assertOnlyValidToken(_tokenId);
        BucketInfo storage bucket = __buckets[_tokenId];
        BucketType storage bucketType = __bucketTypes[bucket.typeIndex];

        return (
            bucketType.amount,
            bucketType.duration,
            bucket.unlockedAt,
            bucket.unstakedAt,
            bucket.delegate
        );
    }

    function stake(
        uint256 _duration,
        bytes12 _delegate
    ) external payable whenNotPaused returns (uint256) {
        uint256 index = _bucketTypeIndex(msg.value, _duration);
        _assertOnlyActiveBucketType(index);

        return _stake(index, msg.value, _duration, _delegate);
    }

    function stake(
        uint256 _amount,
        uint256 _duration,
        bytes12[] memory _delegates
    ) external payable whenNotPaused returns (uint256[] memory tokenIds_) {
        require(_amount * _delegates.length == msg.value, "invalid parameters");
        uint256 index = _bucketTypeIndex(_amount, _duration);
        _assertOnlyActiveBucketType(index);

        tokenIds_ = new uint256[](_delegates.length);
        for (uint256 i = 0; i < _delegates.length; i++) {
            tokenIds_[i] = _stake(index, _amount, _duration, _delegates[i]);
        }

        return tokenIds_;
    }

    function stake(
        uint256 _amount,
        uint256 _duration,
        bytes12 _delegate,
        uint256 _count
    ) external payable whenNotPaused returns (uint256[] memory tokenIds_) {
        require(_count > 0 && _amount * _count == msg.value, "invalid parameters");
        uint256 index = _bucketTypeIndex(_amount, _duration);
        _assertOnlyActiveBucketType(index);

        tokenIds_ = new uint256[](_count);
        for (uint256 i = 0; i < _count; i++) {
            tokenIds_[i] = _stake(index, _amount, _duration, _delegate);
        }

        return tokenIds_;
    }

    function unlock(uint256 _tokenId) external whenNotPaused onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyLockedToken(bucket);
        _unlock(bucket);
        emit Unlocked(_tokenId);
    }

    function unlock(uint256[] calldata _tokenIds) external whenNotPaused {
        uint256 tokenId;
        BucketInfo storage bucket;
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            tokenId = _tokenIds[i];
            _assertOnlyTokenOwner(tokenId);
            bucket = __buckets[tokenId];
            _assertOnlyLockedToken(bucket);
            _unlock(bucket);
            emit Unlocked(tokenId);
        }
    }

    function lock(
        uint256 _tokenId,
        uint256 _duration
    ) external whenNotPaused onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyStakedToken(bucket);
        _lock(bucket, _duration);
        emit Locked(_tokenId, _duration);
    }

    function lock(uint256[] calldata _tokenIds, uint256 _duration) external whenNotPaused {
        uint256 tokenId;
        BucketInfo storage bucket;
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            tokenId = _tokenIds[i];
            _assertOnlyTokenOwner(tokenId);
            bucket = __buckets[tokenId];
            _assertOnlyStakedToken(bucket);
            _lock(bucket, _duration);
            emit Locked(tokenId, _duration);
        }
    }

    function unstake(uint256 _tokenId) external whenNotPaused onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyStakedToken(bucket);
        require(_blocksToUnstake(bucket) == 0, "not ready to unstake");
        _unstake(bucket);
        emit Unstaked(_tokenId);
    }

    function withdraw(
        uint256 _tokenId,
        address payable _recipient
    ) external whenNotPaused onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        require(_blocksToWithdraw(bucket.unstakedAt) == 0, "not ready to withdraw");
        _burn(_tokenId);
        _withdraw(bucket, _recipient, 0);
        emit Withdrawal(_tokenId, _recipient);
    }

    function emergencyWithdraw(
        uint256 _tokenId,
        address payable _recipient
    ) external onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        if (_isLocked(bucket)) {
            _unlock(bucket);
            // emit Unlocked(_tokenId);
        }
        if (_isInStake(bucket)) {
            _unstake(bucket);
            // emit Unstaked(_tokenId);
        }
        _burn(_tokenId);
        uint256 fee = _withdraw(bucket, _recipient, __emergencyWithdrawPenaltyRate);
        emit EmergencyWithdrawal(_tokenId, _recipient, fee);
    }

    function merge(
        uint256[] calldata tokenIds,
        uint256 _newDuration
    ) external payable whenNotPaused {
        require(tokenIds.length > 1, "invalid length");
        uint256 amount = msg.value;
        uint256 tokenId;
        BucketInfo storage bucket;
        BucketType storage bucketType;
        for (uint256 i = tokenIds.length; i > 0; i--) {
            tokenId = tokenIds[i - 1];
            _assertOnlyTokenOwner(tokenId);
            bucket = __buckets[tokenId];
            _assertOnlyStakedToken(bucket);
            bucketType = __bucketTypes[bucket.typeIndex];
            require(_newDuration >= bucketType.duration, "invalid duration");
            amount += bucketType.amount;
            if (_isLocked(bucket)) {
                __lockedVotes[bucket.delegate][bucket.typeIndex]--;
            } else {
                __unlockedVotes[bucket.delegate][bucket.typeIndex]--;
            }
            if (i != 1) {
                _burn(tokenId);
            } else {
                bucket.unlockedAt = UINT256_MAX;
                _updateBucketInfo(bucket, amount, _newDuration);
                emit Merged(tokenIds, amount, _newDuration);
            }
        }
    }

    function extendDuration(
        uint256 _tokenId,
        uint256 _newDuration
    ) external whenNotPaused onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyLockedToken(bucket);
        BucketType storage bucketType = __bucketTypes[bucket.typeIndex];
        require(_newDuration > bucketType.duration, "invalid operation");
        __lockedVotes[bucket.delegate][bucket.typeIndex]--;
        _updateBucketInfo(bucket, bucketType.amount, _newDuration);
        emit DurationExtended(_tokenId, _newDuration);
    }

    function increaseAmount(
        uint256 _tokenId,
        uint256 _newAmount
    ) external payable whenNotPaused onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyLockedToken(bucket);
        BucketType storage bucketType = __bucketTypes[bucket.typeIndex];
        require(msg.value + bucketType.amount == _newAmount, "invalid operation");
        __lockedVotes[bucket.delegate][bucket.typeIndex]--;
        _updateBucketInfo(bucket, _newAmount, bucketType.duration);
        emit AmountIncreased(_tokenId, _newAmount);
    }

    function changeDelegate(uint256 _tokenId, bytes12 _delegate) external whenNotPaused {
        _changeDelegate(_tokenId, _delegate);
    }

    function changeDelegates(
        uint256[] calldata _tokenIds,
        bytes12 _delegate
    ) external whenNotPaused {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            _changeDelegate(_tokenIds[i], _delegate);
        }
    }

    function lockedVotesTo(
        bytes12[] calldata _delegates
    ) external view returns (uint256[][] memory counts_) {
        counts_ = new uint256[][](_delegates.length);
        uint256 tl = numOfBucketTypes();
        for (uint256 i = 0; i < _delegates.length; i++) {
            counts_[i] = new uint256[](tl);
            mapping(uint256 => uint256) storage votes = __lockedVotes[_delegates[i]];
            for (uint256 j = 0; j < tl; j++) {
                counts_[i][j] = votes[j];
            }
        }

        return counts_;
    }

    function unlockedVotesTo(
        bytes12[] calldata _delegates
    ) external view returns (uint256[][] memory counts_) {
        counts_ = new uint256[][](_delegates.length);
        uint256 tl = numOfBucketTypes();
        for (uint256 i = 0; i < _delegates.length; i++) {
            counts_[i] = new uint256[](tl);
            mapping(uint256 => uint256) storage votes = __unlockedVotes[_delegates[i]];
            for (uint256 j = 0; j < tl; j++) {
                counts_[i][j] = votes[j];
            }
        }

        return counts_;
    }

    /////////////////////////////////////////////
    // Private Functions
    function _bucketTypeIndex(uint256 _amount, uint256 _duration) internal view returns (uint256) {
        uint256 index = __bucketTypeIndices[_amount][_duration];
        require(index > 0, "invalid bucket type");

        return index - 1;
    }

    function _isActiveBucketType(uint256 _index) internal view returns (bool) {
        return __bucketTypes[_index].activatedAt <= block.number;
    }

    function _isInStake(BucketInfo storage bucket) internal view returns (bool) {
        return bucket.unstakedAt == UINT256_MAX;
    }

    function _isLocked(BucketInfo storage bucket) internal view returns (bool) {
        return bucket.unlockedAt == UINT256_MAX;
    }

    function _assertOnlyTokenOwner(uint256 _tokenId) internal view {
        require(msg.sender == ownerOf(_tokenId), "not owner");
    }

    function _assertOnlyLockedToken(BucketInfo storage _bucket) internal view {
        require(_isLocked(_bucket), "not a locked token");
    }

    function _assertOnlyStakedToken(BucketInfo storage _bucket) internal view {
        require(_isInStake(_bucket), "not a staked token");
    }

    function _assertOnlyValidToken(uint256 _tokenId) internal view {
        require(_exists(_tokenId), "ERC721: invalid token ID");
    }

    function _assertOnlyActiveBucketType(uint256 _index) internal view {
        require(_isActiveBucketType(_index), "inactive bucket type");
    }

    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _firstTokenId,
        uint256 batchSize
    ) internal override {
        require(batchSize == 1, "batch transfer is not supported");
        require(
            _to == address(0) || _isInStake(__buckets[_firstTokenId]),
            "cannot transfer unstaked token"
        );
        super._beforeTokenTransfer(_from, _to, _firstTokenId, batchSize);
    }

    function _blocksToWithdraw(uint256 unstakedAt) internal view returns (uint256) {
        require(unstakedAt != UINT256_MAX, "not an unstaked bucket");
        if (unstakedAt + (3 * 24 * 60 * 60) / 5 < block.number) {
            return 0;
        }

        return unstakedAt + (3 * 24 * 60 * 60) / 5 - block.number;
    }

    function _blocksToUnstake(BucketInfo storage _bucket) internal view returns (uint256) {
        require(_bucket.unlockedAt != UINT256_MAX, "not an unlocked bucket");
        uint256 duration = __bucketTypes[_bucket.typeIndex].duration;
        if (_bucket.unlockedAt + duration < block.number) {
            return 0;
        }
        return _bucket.unlockedAt + duration - block.number;
    }

    function _stake(
        uint256 _index,
        uint256 _amount,
        uint256 _duration,
        bytes12 _delegate
    ) internal returns (uint256) {
        __buckets[__nextTokenId] = BucketInfo(_index, UINT256_MAX, UINT256_MAX, _delegate);
        __lockedVotes[_delegate][_index]++;
        _safeMint(msg.sender, __nextTokenId);
        emit Staked(__nextTokenId, _delegate, _amount, _duration);

        return __nextTokenId++;
    }

    function _unlock(BucketInfo storage _bucket) internal {
        _bucket.unlockedAt = block.number;
        __lockedVotes[_bucket.delegate][_bucket.typeIndex]--;
        __unlockedVotes[_bucket.delegate][_bucket.typeIndex]++;
    }

    function _lock(BucketInfo storage bucket, uint256 _duration) internal {
        require(_duration >= _blocksToUnstake(bucket), "invalid duration");
        uint256 newIndex = _bucketTypeIndex(__bucketTypes[bucket.typeIndex].amount, _duration);
        _assertOnlyActiveBucketType(newIndex);
        bucket.unlockedAt = UINT256_MAX;
        __unlockedVotes[bucket.delegate][bucket.typeIndex]--;
        bucket.typeIndex = newIndex;
        __lockedVotes[bucket.delegate][newIndex]++;
    }

    function _unstake(BucketInfo storage _bucket) internal {
        _bucket.unstakedAt = block.number;
        __unlockedVotes[_bucket.delegate][_bucket.typeIndex]--;
    }

    function _withdraw(
        BucketInfo storage _bucket,
        address payable _recipient,
        uint256 _penaltyRate
    ) internal returns (uint256 fee_) {
        uint256 amount = __bucketTypes[_bucket.typeIndex].amount;
        if (_penaltyRate != 0) {
            fee_ = (amount * _penaltyRate) / 100;
            __accumulatedWithdrawFee += fee_;
        }
        _recipient.transfer(amount - fee_);
    }

    function _updateBucketInfo(
        BucketInfo storage bucket,
        uint256 _amount,
        uint256 _duration
    ) internal {
        uint256 index = _bucketTypeIndex(_amount, _duration);
        _assertOnlyActiveBucketType(index);
        __lockedVotes[bucket.delegate][index]++;
        bucket.typeIndex = index;
    }

    function _changeDelegate(
        uint256 _tokenId,
        bytes12 _delegate
    ) internal onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        _assertOnlyStakedToken(bucket);
        require(bucket.delegate != _delegate, "invalid operation");
        if (_isLocked(bucket)) {
            __lockedVotes[bucket.delegate][bucket.typeIndex]--;
            __lockedVotes[_delegate][bucket.typeIndex]++;
        } else {
            __unlockedVotes[bucket.delegate][bucket.typeIndex]--;
            __unlockedVotes[_delegate][bucket.typeIndex]++;
        }
        bucket.delegate = _delegate;
        emit DelegateChanged(_tokenId, _delegate);
    }

    function _setEmergencyWithdrawPenaltyRate(uint256 _rate) internal {
        require(_rate <= 100, "invaid penalty rate");
        __emergencyWithdrawPenaltyRate = _rate;
        emit EmergencyWithdrawPenaltyRateUpdated(_rate);
    }
}
