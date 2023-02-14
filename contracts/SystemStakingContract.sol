// SPDX-License-Identifier: MIT
pragma solidity >= 0.8;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

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

uint256 constant UINT256_MAX = type(uint256).max;

contract SystemStaking is ERC721, Ownable, Pausable {
    event NewBucketType(uint256 amount, uint256 duration);
    event BucketTypeActivated(uint256 amount, uint256 duration);
    event BucketTypeDeactivated(uint256 amount, uint256 duration);
    event Staked(uint256 tokenId, uint256 amount, uint256 duration, bytes8 delegate);
    event Unstaked(uint256 tokenId);
    event DelegateChanged(uint256 tokenId, bytes8 oldDelegate, bytes8 newDelegate);

    modifier onlyValidToken(uint256 _tokenId) {
        require(_exists(_tokenId), "invalid token id");
        _;
    }

    modifier onlyStakedToken(uint256 _tokenId) {
        require(_exists(_tokenId) && _isInStake(_tokenId), "invalid token id");
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

    // TODO: init ERC721
    constructor() ERC721("", "") {
        __nextTokenId = 1;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // bucket type related functions
    function _bucketTypeIndex(uint256 _amount, uint256 _duration) internal view returns (uint256) {
        uint256 index = __typeIndice[_amount][_duration];
        require(index > 0, "invalid bucket type");
        return index - 1;
    }

    function addBucketType(uint256 _amount, uint256 _duration) public onlyOwner {
        require(_amount != 0, "amount is invalid");
        require(__typeIndice[_amount][_duration] == 0, "duplicate bucket type");
        __types.push(BucketType(_amount, _duration, block.number));
        // type index = index_in_array + 1
        __typeIndice[_amount][_duration] = numOfBucketTypes();
        emit NewBucketType(_amount, _duration);
    }

    function deactivateBucketType(uint256 _amount, uint256 _duration) public onlyOwner {
        __types[_bucketTypeIndex(_amount, _duration)].activatedAt = UINT256_MAX;
        emit BucketTypeDeactivated(_amount, _duration);
    }

    function activateBucketType(uint256 _amount, uint256 _duration) public onlyOwner {
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

    function bucketTypes(uint256 _offset, uint256 _size) external view returns (BucketType[] memory types_) {
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

    function _beforeTokenTransfer(address _from, address _to, uint256 _firstTokenId, uint256 batchSize) internal override {
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

    function stake(uint256 _duration, bytes8 _delegate) payable external returns (uint256) {
        uint256 index = _bucketTypeIndex(msg.value, _duration);
        require(_isActiveBucketType(index), "not active bucket type");
        _safeMint(msg.sender, __nextTokenId);
        __buckets[__nextTokenId] = BucketInfo(index, UINT256_MAX, _delegate);
        __votes[_delegate][index]++;
        emit Staked(__nextTokenId, msg.value, _duration, _delegate);

        return __nextTokenId++;
    }

    function unstake(uint256 _tokenId) external onlyStakedToken(_tokenId) {
        require(msg.sender == ownerOf(_tokenId), "invalid owner");
        BucketInfo storage bucket = __buckets[_tokenId];
        bucket.unstakedAt = block.number;
        __votes[bucket.delegate][bucket.typeIndex]--;
        emit Unstaked(_tokenId);
    }

    function withdraw(uint256 _tokenId, address payable _receipcent) external {
        require(readyToWithdraw(_tokenId), "not ready to withdraw");
        require(msg.sender == ownerOf(_tokenId), "invalid owner");
        _burn(_tokenId);
        _receipcent.transfer(__types[__buckets[_tokenId].typeIndex].amount);
    }

    function bucketTypeOf(uint256 _tokenId) external onlyValidToken(_tokenId) view returns (BucketType memory) {
        return __types[__buckets[_tokenId].typeIndex];
    }

    function delegateOf(uint256 _tokenId) external view returns (bytes8) {
        return __buckets[_tokenId].delegate;
    }

    function changeDelegate(uint256 _tokenId, bytes8 _delegate) external onlyStakedToken(_tokenId) {
        BucketInfo memory bucket = __buckets[_tokenId];
        __votes[bucket.delegate][bucket.typeIndex]--;
        __votes[_delegate][bucket.typeIndex]++;
        __buckets[_tokenId].delegate = _delegate;
        emit DelegateChanged(_tokenId, bucket.delegate, _delegate);
    }

    function changeDelegates(uint256[] calldata _tokenIds, bytes8 _delegate) public {
        // TODO
    }

    function votesTo(bytes8[] calldata _delegates) external view returns (uint256[][] memory counts_) {
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
