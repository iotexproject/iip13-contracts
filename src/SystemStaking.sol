// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct BucketInfo {
    uint256 typeIndex;
    uint256 unstakedAt;
    bytes8 delegate;
}

struct BucketType {
    uint256 amount;
    uint256 duration;
    uint256 activatedAt;
}

contract SystemStaking is ERC721, Ownable {
    uint256 constant UINT256_MAX = type(uint256).max;

    event NewBucketType(uint256 amount, uint256 duration);
    event BucketTypeActivated(uint256 amount, uint256 duration);
    event BucketTypeDeactivated(uint256 amount, uint256 duration);
    event Staked(
        uint256 indexed tokenId,
        bytes8 indexed delegate,
        uint256 amount,
        uint256 duration
    );
    event Unstaked(uint256 indexed tokenId);
    event DelegateChanged(
        uint256 indexed tokenId,
        bytes8 indexed oldDelegate,
        bytes8 indexed newDelegate
    );
    event Withdrawal(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 amount,
        uint256 penaltyFee
    );
    event FeeWithdrawal(address indexed recipient, uint256 amount);

    modifier onlyValidToken(uint256 _tokenId) {
        require(_exists(_tokenId), "invalid token");
        _;
    }

    modifier onlyStakedToken(uint256 _tokenId) {
        require(_exists(_tokenId) && _isInStake(_tokenId), "token not in stake");
        _;
    }

    modifier onlyTokenOwner(uint256 _tokenId) {
        require(msg.sender == ownerOf(_tokenId), "not owner");
        _;
    }

    // token id
    uint256 private __nextTokenId;
    // mapping from token ID to bucket
    mapping(uint256 => BucketInfo) private __buckets;
    // delegate name -> bucket type -> count
    mapping(bytes8 => mapping(uint256 => uint256)) private __votes;
    // bucket types
    BucketType[] private __types;
    // amount -> duration -> index
    mapping(uint256 => mapping(uint256 => uint256)) private __typeIndice;
    // emergency withdraw penalty rate
    uint256 private __emergencyWithdrawPenaltyRate;
    // accumulated fee for emergency withdraw
    uint256 private __accumulatedWithdrawFee;

    constructor() ERC721("BucketNFT", "BKT") {
        __nextTokenId = 1;
        __emergencyWithdrawPenaltyRate = 100;
    }

    // emergency withdraw functions
    function setEmergencyWithdrawPenaltyRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "");
        __emergencyWithdrawPenaltyRate = _rate;
    }

    function emergencyWithdrawPenaltyRate() external view returns (uint256) {
        return __emergencyWithdrawPenaltyRate;
    }

    function accumulatedWithdrawFee() external view returns (uint256) {
        return __accumulatedWithdrawFee;
    }

    function emergencyWithdraw(uint256 _tokenId, address payable _recipient) external {
        unstake(_tokenId);
        _withdraw(_tokenId, _recipient, __emergencyWithdrawPenaltyRate);
    }

    function withdrawFee(uint256 _amount, address payable _recipient) external onlyOwner {
        require(_amount <= __accumulatedWithdrawFee, "invalid amount");
        _recipient.transfer(_amount);
        emit FeeWithdrawal(_recipient, _amount);
    }

    // bucket type related functions
    function _bucketTypeIndex(uint256 _amount, uint256 _duration) internal view returns (uint256) {
        uint256 index = __typeIndice[_amount][_duration];
        require(index > 0, "invalid bucket type");

        return index - 1;
    }

    function addBucketType(uint256 _amount, uint256 _duration) external onlyOwner {
        require(_amount != 0, "amount is invalid");
        require(__typeIndice[_amount][_duration] == 0, "duplicate bucket type");
        __types.push(BucketType(_amount, _duration, block.number));
        // type index = index_in_array + 1
        __typeIndice[_amount][_duration] = numOfBucketTypes();
        emit NewBucketType(_amount, _duration);
    }

    function deactivateBucketType(uint256 _amount, uint256 _duration) external onlyOwner {
        __types[_bucketTypeIndex(_amount, _duration)].activatedAt = UINT256_MAX;
        emit BucketTypeDeactivated(_amount, _duration);
    }

    function activateBucketType(uint256 _amount, uint256 _duration) external onlyOwner {
        __types[_bucketTypeIndex(_amount, _duration)].activatedAt = block.number;
        emit BucketTypeActivated(_amount, _duration);
    }

    function _isActiveBucketType(uint256 _index) internal view returns (bool) {
        return __types[_index].activatedAt <= block.number;
    }

    function isActiveBucketType(uint256 _amount, uint256 _duration) external view returns (bool) {
        return _isActiveBucketType(_bucketTypeIndex(_amount, _duration));
    }

    function numOfBucketTypes() public view returns (uint256) {
        return __types.length;
    }

    function bucketTypes(
        uint256 _offset,
        uint256 _size
    ) external view returns (BucketType[] memory types_) {
        require(_size > 0 && _offset + _size <= numOfBucketTypes(), "invalid parameters");
        types_ = new BucketType[](_size);
        for (uint256 i = 0; i < _size; i++) {
            types_[i] = __types[_offset + i];
        }
        return types_;
    }

    // token related functions
    function _isInStake(uint256 _tokenId) internal view returns (bool) {
        return __buckets[_tokenId].unstakedAt == UINT256_MAX;
    }

    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _firstTokenId,
        uint256 batchSize
    ) internal override {
        require(batchSize == 1, "batch transfer is not supported");
        require(_isInStake(_firstTokenId), "cannot transfer unstaked bucket");
        super._beforeTokenTransfer(_from, _to, _firstTokenId, batchSize);
    }

    function readyToWithdraw(uint256 _tokenId) public view onlyValidToken(_tokenId) returns (bool) {
        if (_isInStake(_tokenId)) {
            return false;
        }
        BucketInfo memory bucket = __buckets[_tokenId];

        return bucket.unstakedAt + __types[bucket.typeIndex].duration <= block.number;
    }

    function bucketTypeOf(
        uint256 _tokenId
    ) external view onlyValidToken(_tokenId) returns (BucketType memory) {
        return __types[__buckets[_tokenId].typeIndex];
    }

    function delegateOf(uint256 _tokenId) external view onlyValidToken(_tokenId) returns (bytes8) {
        return __buckets[_tokenId].delegate;
    }

    function stake(uint256 _duration, bytes8 _delegate) external payable returns (uint256) {
        uint256 index = _bucketTypeIndex(msg.value, _duration);
        require(_isActiveBucketType(index), "not active bucket type");
        _safeMint(msg.sender, __nextTokenId);
        __buckets[__nextTokenId] = BucketInfo(index, UINT256_MAX, _delegate);
        __votes[_delegate][index]++;
        emit Staked(__nextTokenId, _delegate, msg.value, _duration);

        return __nextTokenId++;
    }

    function unstake(uint256 _tokenId) public onlyStakedToken(_tokenId) onlyTokenOwner(_tokenId) {
        BucketInfo storage bucket = __buckets[_tokenId];
        bucket.unstakedAt = block.number;
        __votes[bucket.delegate][bucket.typeIndex]--;
        emit Unstaked(_tokenId);
    }

    function withdraw(
        uint256 _tokenId,
        address payable _recipient
    ) external onlyTokenOwner(_tokenId) {
        require(readyToWithdraw(_tokenId), "not ready to withdraw");
        _withdraw(_tokenId, _recipient, 0);
    }

    function _withdraw(
        uint256 _tokenId,
        address payable _recipient,
        uint256 _penaltyRate
    ) internal {
        _burn(_tokenId);
        uint256 amount = __types[__buckets[_tokenId].typeIndex].amount;
        uint256 fee = 0;
        if (_penaltyRate != 0) {
            fee = (amount * _penaltyRate) / 100;
            __accumulatedWithdrawFee += fee;
        }
        _recipient.transfer(amount - fee);
        emit Withdrawal(_tokenId, _recipient, amount, fee);
    }

    function changeDelegate(
        uint256 _tokenId,
        bytes8 _delegate
    ) public onlyStakedToken(_tokenId) onlyTokenOwner(_tokenId) {
        BucketInfo memory bucket = __buckets[_tokenId];
        require(bucket.delegate != _delegate, "invalid operation");
        __votes[bucket.delegate][bucket.typeIndex]--;
        __votes[_delegate][bucket.typeIndex]++;
        __buckets[_tokenId].delegate = _delegate;
        emit DelegateChanged(_tokenId, bucket.delegate, _delegate);
    }

    function changeDelegates(uint256[] calldata _tokenIds, bytes8 _delegate) external {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            changeDelegate(_tokenIds[i], _delegate);
        }
    }

    function votesTo(
        bytes8[] calldata _delegates
    ) external view returns (uint256[][] memory counts_) {
        counts_ = new uint256[][](_delegates.length);
        uint256 tl = numOfBucketTypes();
        for (uint256 i = 0; i < _delegates.length; i++) {
            counts_[i] = new uint256[](tl);
            mapping(uint256 => uint256) storage votes = __votes[_delegates[i]];
            for (uint256 j = 0; i < tl; i++) {
                counts_[i][j] = votes[i];
            }
        }

        return counts_;
    }
}
