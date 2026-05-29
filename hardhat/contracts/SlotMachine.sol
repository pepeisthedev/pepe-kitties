// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./chainlink/IVRFCoordinatorV2Plus.sol";
import "./chainlink/VRFConsumerBaseV2Plus.sol";
import "./chainlink/VRFV2PlusClient.sol";

interface ISlotMachineMockVRFCoordinator {
    function fulfillRequest(uint256 requestId) external;
}

interface ISlotMachineERC721Item {
    function itemType(uint256 tokenId) external view returns (uint256);
}

contract SlotMachine is Ownable, ReentrancyGuard, ERC721Holder, VRFConsumerBaseV2Plus {
    using SafeERC20 for IERC20;

    uint256 public constant WEIGHT_DENOMINATOR = 10_000;
    uint32 public constant NUM_WORDS = 1;

    enum PrizeTokenType {
        NONE,
        ERC721,
        ERC20
    }

    struct Prize {
        string name;
        address token;
        PrizeTokenType prizeType;
        uint256 weightBps;
        uint256 erc20Amount;
        uint256 erc721ItemTypeId;
        bool active;
    }

    struct PendingSpin {
        address player;
        bool active;
    }

    IERC20 public fregCoin;
    address public liquidityVault;
    uint256 public spinCost;
    bool public active;

    uint256 public subscriptionId;
    bytes32 public keyHash;
    uint32 public callbackGasLimit = 500_000;
    uint16 public requestConfirmations = 3;
    bool public autoFulfill;

    Prize[] private prizes;
    uint256 public totalPrizeWeightBps;

    mapping(uint256 => PendingSpin) public pendingSpins;
    uint256 public pendingSpinCount;

    mapping(uint256 => uint256[]) private erc721PrizeTokenIds;
    mapping(uint256 => mapping(uint256 => uint256)) private erc721TokenIndexPlusOne;

    event ActiveSet(bool active);
    event PaymentConfigSet(address indexed fregCoin, address indexed liquidityVault, uint256 spinCost);
    event VrfConfigSet(uint256 subscriptionId, bytes32 keyHash);
    event CoordinatorSet(address indexed coordinator);
    event CallbackGasLimitSet(uint32 callbackGasLimit);
    event RequestConfirmationsSet(uint16 requestConfirmations);
    event AutoFulfillSet(bool autoFulfill);

    event PrizeAdded(
        uint256 indexed prizeId,
        string name,
        address indexed token,
        PrizeTokenType prizeType,
        uint256 weightBps,
        uint256 erc20Amount
    );
    event PrizeNameSet(uint256 indexed prizeId, string name);
    event PrizeWeightSet(uint256 indexed prizeId, uint256 weightBps, uint256 totalPrizeWeightBps);
    event PrizeActiveSet(uint256 indexed prizeId, bool active);
    event ERC20PrizeAmountSet(uint256 indexed prizeId, uint256 erc20Amount);
    event ERC721PrizeItemTypeSet(uint256 indexed prizeId, uint256 itemTypeId);

    event ERC721PrizeFunded(uint256 indexed prizeId, address indexed token, uint256 indexed tokenId);
    event ERC721PrizeReceivedUntracked(address indexed token, uint256 indexed tokenId);
    event ERC721PrizeWithdrawn(uint256 indexed prizeId, address indexed token, uint256 indexed tokenId, address to);
    event ERC20PrizeDeposited(uint256 indexed prizeId, address indexed token, uint256 amount);
    event ERC20PrizeWithdrawn(address indexed token, address indexed to, uint256 amount);

    event SpinPayment(address indexed player, uint256 amount, address indexed liquidityVault);
    event SpinRequested(uint256 indexed requestId, address indexed player, uint256 spinCost);
    event PrizeOutOfStock(uint256 indexed requestId, address indexed player, uint256 indexed prizeId);
    event SpinResult(
        address indexed player,
        uint256 indexed requestId,
        bool won,
        uint256 prizeId,
        PrizeTokenType prizeType,
        address prizeToken,
        uint256 tokenId,
        uint256 amount
    );
    event PendingSpinResolvedAsLoss(uint256 indexed requestId, address indexed player);

    modifier noPendingSpins() {
        require(pendingSpinCount == 0, "Spin requests pending");
        _;
    }

    constructor(
        address coordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _fregCoin,
        address _liquidityVault,
        uint256 _spinCost
    )
        Ownable(msg.sender)
        VRFConsumerBaseV2Plus(coordinator)
    {
        require(_fregCoin != address(0), "Invalid FregCoin");
        require(_liquidityVault != address(0), "Invalid liquidity vault");
        fregCoin = IERC20(_fregCoin);
        liquidityVault = _liquidityVault;
        spinCost = _spinCost;
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
    }

    function spin() external nonReentrant returns (uint256 requestId) {
        require(active, "Slot machine is not active");
        require(address(fregCoin) != address(0), "FregCoin not set");
        require(liquidityVault != address(0), "Liquidity vault not set");
        require(spinCost > 0, "Spin cost not set");

        fregCoin.safeTransferFrom(msg.sender, liquidityVault, spinCost);
        emit SpinPayment(msg.sender, spinCost, liquidityVault);

        requestId = _requestRandomness();
        pendingSpins[requestId] = PendingSpin({player: msg.sender, active: true});
        pendingSpinCount += 1;

        emit SpinRequested(requestId, msg.sender, spinCost);
        _autoFulfillIfEnabled(requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        PendingSpin memory pending = pendingSpins[requestId];
        if (!pending.active) {
            return;
        }

        delete pendingSpins[requestId];
        pendingSpinCount -= 1;

        _settleSpin(requestId, pending.player, randomWords[0]);
    }

    function _settleSpin(uint256 requestId, address player, uint256 randomWord) internal {
        uint256 roll = randomWord % WEIGHT_DENOMINATOR;
        uint256 cumulative = 0;

        for (uint256 i = 0; i < prizes.length; i++) {
            Prize storage prize = prizes[i];
            cumulative += prize.weightBps;

            if (roll >= cumulative) {
                continue;
            }

            uint256 prizeId = i + 1;
            if (!prize.active || !_hasPrizeStock(prizeId, prize)) {
                emit PrizeOutOfStock(requestId, player, prizeId);
                emit SpinResult(player, requestId, false, prizeId, prize.prizeType, prize.token, 0, 0);
                return;
            }

            if (prize.prizeType == PrizeTokenType.ERC721) {
                uint256 tokenId = _removeRandomERC721Prize(prizeId, randomWord, player);
                IERC721(prize.token).safeTransferFrom(address(this), player, tokenId);
                emit SpinResult(player, requestId, true, prizeId, prize.prizeType, prize.token, tokenId, 0);
                return;
            }

            if (prize.prizeType == PrizeTokenType.ERC20) {
                IERC20(prize.token).safeTransfer(player, prize.erc20Amount);
                emit SpinResult(player, requestId, true, prizeId, prize.prizeType, prize.token, 0, prize.erc20Amount);
                return;
            }

            emit SpinResult(player, requestId, false, prizeId, prize.prizeType, prize.token, 0, 0);
            return;
        }

        emit SpinResult(player, requestId, false, 0, PrizeTokenType.NONE, address(0), 0, 0);
    }

    function _requestRandomness() internal returns (uint256) {
        return i_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );
    }

    function _autoFulfillIfEnabled(uint256 requestId) internal {
        if (autoFulfill) {
            ISlotMachineMockVRFCoordinator(address(i_vrfCoordinator)).fulfillRequest(requestId);
        }
    }

    function _hasPrizeStock(uint256 prizeId, Prize storage prize) internal view returns (bool) {
        if (prize.prizeType == PrizeTokenType.ERC721) {
            return erc721PrizeTokenIds[prizeId].length > 0;
        }

        if (prize.prizeType == PrizeTokenType.ERC20) {
            return prize.erc20Amount > 0 && IERC20(prize.token).balanceOf(address(this)) >= prize.erc20Amount;
        }

        return false;
    }

    function _removeRandomERC721Prize(uint256 prizeId, uint256 randomWord, address player) internal returns (uint256) {
        uint256[] storage tokenIds = erc721PrizeTokenIds[prizeId];
        require(tokenIds.length > 0, "Prize out of stock");

        uint256 index = uint256(keccak256(abi.encode(randomWord, prizeId, player))) % tokenIds.length;
        uint256 tokenId = tokenIds[index];
        _removeERC721PrizeAt(prizeId, index);
        return tokenId;
    }

    function _removeERC721PrizeAt(uint256 prizeId, uint256 index) internal {
        uint256[] storage tokenIds = erc721PrizeTokenIds[prizeId];
        uint256 tokenId = tokenIds[index];
        uint256 lastIndex = tokenIds.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = tokenIds[lastIndex];
            tokenIds[index] = lastTokenId;
            erc721TokenIndexPlusOne[prizeId][lastTokenId] = index + 1;
        }

        tokenIds.pop();
        delete erc721TokenIndexPlusOne[prizeId][tokenId];
    }

    function _readERC721ItemType(address token, uint256 tokenId) internal view returns (uint256) {
        try ISlotMachineERC721Item(token).itemType(tokenId) returns (uint256 itemTypeId) {
            return itemTypeId;
        } catch {
            return 0;
        }
    }

    function _hasERC721PrizeToken(address token) internal view returns (bool) {
        for (uint256 i = 0; i < prizes.length; i++) {
            if (prizes[i].prizeType == PrizeTokenType.ERC721 && prizes[i].token == token) {
                return true;
            }
        }
        return false;
    }

    function _recordERC721Prize(uint256 prizeId, address token, uint256 tokenId) internal {
        Prize storage prize = _getPrize(prizeId);
        require(prize.prizeType == PrizeTokenType.ERC721, "Prize is not ERC721");
        require(prize.token == token, "Wrong prize token");
        if (prize.erc721ItemTypeId != 0) {
            require(_readERC721ItemType(token, tokenId) == prize.erc721ItemTypeId, "Wrong prize item type");
        }
        require(erc721TokenIndexPlusOne[prizeId][tokenId] == 0, "Token already tracked");
        require(IERC721(token).ownerOf(tokenId) == address(this), "Contract does not own token");

        erc721PrizeTokenIds[prizeId].push(tokenId);
        erc721TokenIndexPlusOne[prizeId][tokenId] = erc721PrizeTokenIds[prizeId].length;
        emit ERC721PrizeFunded(prizeId, token, tokenId);
    }

    function _findUniqueERC721Prize(address token, uint256 tokenId) internal view returns (uint256 prizeId) {
        uint256 tokenPrizeCount = 0;

        for (uint256 i = 0; i < prizes.length; i++) {
            if (prizes[i].prizeType == PrizeTokenType.ERC721 && prizes[i].token == token) {
                tokenPrizeCount += 1;
                prizeId = i + 1;
            }
        }

        if (tokenPrizeCount <= 1) {
            return prizeId;
        }

        uint256 itemTypeId = _readERC721ItemType(token, tokenId);
        if (itemTypeId == 0) {
            return 0;
        }

        prizeId = 0;
        for (uint256 i = 0; i < prizes.length; i++) {
            Prize storage prize = prizes[i];
            if (
                prize.prizeType == PrizeTokenType.ERC721 &&
                prize.token == token &&
                prize.erc721ItemTypeId == itemTypeId
            ) {
                if (prizeId != 0) {
                    return 0;
                }
                prizeId = i + 1;
            }
        }
    }

    function _getPrize(uint256 prizeId) internal view returns (Prize storage prize) {
        require(prizeId > 0 && prizeId <= prizes.length, "Invalid prize");
        prize = prizes[prizeId - 1];
    }

    function _setPrizeWeight(uint256 prizeId, uint256 weightBps) internal {
        require(weightBps <= WEIGHT_DENOMINATOR, "Invalid weight");
        Prize storage prize = _getPrize(prizeId);
        totalPrizeWeightBps = totalPrizeWeightBps - prize.weightBps + weightBps;
        require(totalPrizeWeightBps <= WEIGHT_DENOMINATOR, "Prize weights exceed 100%");
        prize.weightBps = weightBps;
        emit PrizeWeightSet(prizeId, weightBps, totalPrizeWeightBps);
    }

    function onERC721Received(address, address, uint256 tokenId, bytes memory data)
        public
        override(ERC721Holder)
        returns (bytes4)
    {
        uint256 prizeId = data.length >= 32 ? abi.decode(data, (uint256)) : _findUniqueERC721Prize(msg.sender, tokenId);

        if (prizeId == 0) {
            require(_hasERC721PrizeToken(msg.sender), "Prize id required");
            emit ERC721PrizeReceivedUntracked(msg.sender, tokenId);
            return IERC721Receiver.onERC721Received.selector;
        }

        Prize storage prize = _getPrize(prizeId);
        if (data.length < 32 && prize.erc721ItemTypeId != 0 && _readERC721ItemType(msg.sender, tokenId) == 0) {
            emit ERC721PrizeReceivedUntracked(msg.sender, tokenId);
            return IERC721Receiver.onERC721Received.selector;
        }

        _recordERC721Prize(prizeId, msg.sender, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    // ============ Owner configuration ============

    function setActive(bool _active) external onlyOwner {
        active = _active;
        emit ActiveSet(_active);
    }

    function setPaymentConfig(address _fregCoin, address _liquidityVault, uint256 _spinCost)
        external
        onlyOwner
        noPendingSpins
    {
        require(_fregCoin != address(0), "Invalid FregCoin");
        require(_liquidityVault != address(0), "Invalid liquidity vault");
        fregCoin = IERC20(_fregCoin);
        liquidityVault = _liquidityVault;
        spinCost = _spinCost;
        emit PaymentConfigSet(_fregCoin, _liquidityVault, _spinCost);
    }

    function setSpinCost(uint256 _spinCost) external onlyOwner noPendingSpins {
        spinCost = _spinCost;
        emit PaymentConfigSet(address(fregCoin), liquidityVault, _spinCost);
    }

    function setVrfConfig(uint256 _subscriptionId, bytes32 _keyHash) external onlyOwner noPendingSpins {
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        emit VrfConfigSet(_subscriptionId, _keyHash);
    }

    function setCoordinator(address _coordinator) external onlyOwner noPendingSpins {
        require(_coordinator != address(0), "Invalid coordinator");
        i_vrfCoordinator = IVRFCoordinatorV2Plus(_coordinator);
        emit CoordinatorSet(_coordinator);
    }

    function setCallbackGasLimit(uint32 _callbackGasLimit) external onlyOwner noPendingSpins {
        callbackGasLimit = _callbackGasLimit;
        emit CallbackGasLimitSet(_callbackGasLimit);
    }

    function setRequestConfirmations(uint16 _requestConfirmations) external onlyOwner noPendingSpins {
        require(_requestConfirmations > 0, "Invalid confirmations");
        requestConfirmations = _requestConfirmations;
        emit RequestConfirmationsSet(_requestConfirmations);
    }

    function setAutoFulfill(bool _autoFulfill) external onlyOwner {
        autoFulfill = _autoFulfill;
        emit AutoFulfillSet(_autoFulfill);
    }

    function _addERC721Prize(string calldata name, address token, uint256 weightBps, uint256 itemTypeId)
        internal
        returns (uint256 prizeId)
    {
        require(bytes(name).length > 0, "Name required");
        require(token != address(0), "Invalid token");
        require(weightBps <= WEIGHT_DENOMINATOR, "Invalid weight");

        totalPrizeWeightBps += weightBps;
        require(totalPrizeWeightBps <= WEIGHT_DENOMINATOR, "Prize weights exceed 100%");

        prizes.push(Prize({
            name: name,
            token: token,
            prizeType: PrizeTokenType.ERC721,
            weightBps: weightBps,
            erc20Amount: 0,
            erc721ItemTypeId: itemTypeId,
            active: true
        }));

        prizeId = prizes.length;
        emit PrizeAdded(prizeId, name, token, PrizeTokenType.ERC721, weightBps, 0);
        if (itemTypeId != 0) {
            emit ERC721PrizeItemTypeSet(prizeId, itemTypeId);
        }
    }

    function addERC721Prize(string calldata name, address token, uint256 weightBps)
        external
        onlyOwner
        noPendingSpins
        returns (uint256 prizeId)
    {
        prizeId = _addERC721Prize(name, token, weightBps, 0);
    }

    function addERC721ItemPrize(string calldata name, address token, uint256 itemTypeId, uint256 weightBps)
        external
        onlyOwner
        noPendingSpins
        returns (uint256 prizeId)
    {
        require(itemTypeId != 0, "Item type required");
        prizeId = _addERC721Prize(name, token, weightBps, itemTypeId);
    }

    function addERC20Prize(string calldata name, address token, uint256 weightBps, uint256 amountPerWin)
        external
        onlyOwner
        noPendingSpins
        returns (uint256 prizeId)
    {
        require(bytes(name).length > 0, "Name required");
        require(token != address(0), "Invalid token");
        require(amountPerWin > 0, "Amount required");
        require(weightBps <= WEIGHT_DENOMINATOR, "Invalid weight");

        totalPrizeWeightBps += weightBps;
        require(totalPrizeWeightBps <= WEIGHT_DENOMINATOR, "Prize weights exceed 100%");

        prizes.push(Prize({
            name: name,
            token: token,
            prizeType: PrizeTokenType.ERC20,
            weightBps: weightBps,
            erc20Amount: amountPerWin,
            erc721ItemTypeId: 0,
            active: true
        }));

        prizeId = prizes.length;
        emit PrizeAdded(prizeId, name, token, PrizeTokenType.ERC20, weightBps, amountPerWin);
    }

    function setPrizeName(uint256 prizeId, string calldata name) external onlyOwner {
        require(bytes(name).length > 0, "Name required");
        Prize storage prize = _getPrize(prizeId);
        prize.name = name;
        emit PrizeNameSet(prizeId, name);
    }

    function setPrizeWeight(uint256 prizeId, uint256 weightBps) external onlyOwner noPendingSpins {
        _setPrizeWeight(prizeId, weightBps);
    }

    function setPrizeActive(uint256 prizeId, bool _active) external onlyOwner noPendingSpins {
        Prize storage prize = _getPrize(prizeId);
        prize.active = _active;
        emit PrizeActiveSet(prizeId, _active);
    }

    function setERC20PrizeAmount(uint256 prizeId, uint256 amountPerWin) external onlyOwner noPendingSpins {
        require(amountPerWin > 0, "Amount required");
        Prize storage prize = _getPrize(prizeId);
        require(prize.prizeType == PrizeTokenType.ERC20, "Prize is not ERC20");
        prize.erc20Amount = amountPerWin;
        emit ERC20PrizeAmountSet(prizeId, amountPerWin);
    }

    function setERC721PrizeItemType(uint256 prizeId, uint256 itemTypeId) external onlyOwner noPendingSpins {
        Prize storage prize = _getPrize(prizeId);
        require(prize.prizeType == PrizeTokenType.ERC721, "Prize is not ERC721");
        prize.erc721ItemTypeId = itemTypeId;
        emit ERC721PrizeItemTypeSet(prizeId, itemTypeId);
    }

    // ============ Funding and withdrawals ============

    function depositERC721Prize(uint256 prizeId, uint256[] calldata tokenIds) external nonReentrant {
        Prize storage prize = _getPrize(prizeId);
        require(prize.prizeType == PrizeTokenType.ERC721, "Prize is not ERC721");
        require(tokenIds.length > 0, "No token IDs");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            IERC721(prize.token).safeTransferFrom(msg.sender, address(this), tokenIds[i], abi.encode(prizeId));
        }
    }

    function registerERC721Prize(uint256 prizeId, uint256 tokenId) external onlyOwner {
        Prize storage prize = _getPrize(prizeId);
        _recordERC721Prize(prizeId, prize.token, tokenId);
    }

    function depositERC20Prize(uint256 prizeId, uint256 amount) external nonReentrant {
        Prize storage prize = _getPrize(prizeId);
        require(prize.prizeType == PrizeTokenType.ERC20, "Prize is not ERC20");
        require(amount > 0, "Amount required");
        IERC20(prize.token).safeTransferFrom(msg.sender, address(this), amount);
        emit ERC20PrizeDeposited(prizeId, prize.token, amount);
    }

    function withdrawERC721Prize(uint256 prizeId, uint256 tokenId, address to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        Prize storage prize = _getPrize(prizeId);
        require(prize.prizeType == PrizeTokenType.ERC721, "Prize is not ERC721");

        uint256 indexPlusOne = erc721TokenIndexPlusOne[prizeId][tokenId];
        require(indexPlusOne != 0, "Token not tracked");
        _removeERC721PrizeAt(prizeId, indexPlusOne - 1);

        IERC721(prize.token).safeTransferFrom(address(this), to, tokenId);
        emit ERC721PrizeWithdrawn(prizeId, prize.token, tokenId, to);
    }

    function withdrawUntrackedERC721(address token, uint256 tokenId, address to) external onlyOwner nonReentrant {
        require(token != address(0), "Invalid token");
        require(to != address(0), "Invalid recipient");
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
    }

    function withdrawERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "Invalid token");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount required");
        IERC20(token).safeTransfer(to, amount);
        emit ERC20PrizeWithdrawn(token, to, amount);
    }

    function resolvePendingSpinAsLoss(uint256 requestId) external onlyOwner {
        PendingSpin memory pending = pendingSpins[requestId];
        require(pending.active, "Unknown spin request");

        delete pendingSpins[requestId];
        pendingSpinCount -= 1;

        emit PendingSpinResolvedAsLoss(requestId, pending.player);
        emit SpinResult(pending.player, requestId, false, 0, PrizeTokenType.NONE, address(0), 0, 0);
    }

    // ============ Views ============

    function getPrizesCount() external view returns (uint256) {
        return prizes.length;
    }

    function getPrizeInfo(uint256 prizeId)
        external
        view
        returns (
            string memory name,
            address token,
            PrizeTokenType prizeType,
            uint256 weightBps,
            uint256 erc20Amount,
            bool prizeActive,
            uint256 stock
        )
    {
        Prize storage prize = _getPrize(prizeId);
        return (
            prize.name,
            prize.token,
            prize.prizeType,
            prize.weightBps,
            prize.erc20Amount,
            prize.active,
            getPrizeStock(prizeId)
        );
    }

    function getPrizeStock(uint256 prizeId) public view returns (uint256) {
        Prize storage prize = _getPrize(prizeId);
        if (prize.prizeType == PrizeTokenType.ERC721) {
            return erc721PrizeTokenIds[prizeId].length;
        }

        if (prize.prizeType == PrizeTokenType.ERC20) {
            if (prize.erc20Amount == 0) {
                return 0;
            }
            return IERC20(prize.token).balanceOf(address(this)) / prize.erc20Amount;
        }

        return 0;
    }

    function getPrizeItemTypeId(uint256 prizeId) external view returns (uint256) {
        Prize storage prize = _getPrize(prizeId);
        return prize.erc721ItemTypeId;
    }

    function getERC721PrizeTokenIds(uint256 prizeId) external view returns (uint256[] memory) {
        _getPrize(prizeId);
        return erc721PrizeTokenIds[prizeId];
    }

    function getLoseWeightBps() external view returns (uint256) {
        return WEIGHT_DENOMINATOR - totalPrizeWeightBps;
    }

    function getEffectiveWinWeightBps() external view returns (uint256 winWeightBps) {
        for (uint256 i = 0; i < prizes.length; i++) {
            Prize storage prize = prizes[i];
            if (prize.active && _hasPrizeStock(i + 1, prize)) {
                winWeightBps += prize.weightBps;
            }
        }
    }
}
