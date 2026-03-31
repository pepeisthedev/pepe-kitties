// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./chainlink/VRFV2PlusClient.sol";
import "./chainlink/VRFV2PlusWrapperConsumerBase.sol";

interface IFregsRandomMintConsumer {
    function fulfillMint(address minter, string calldata color, uint256 randomWord) external;
}

interface IFregsItemsRandomConsumer {
    function fulfillClaimItem(address requester, uint256 fregId, uint256 randomWord) external;
    function fulfillHeadReroll(address requester, uint256 itemTokenId, uint256 fregId, uint256 randomWord) external;
}

interface ISpinTheWheelRandomConsumer {
    function fulfillSpin(address player, uint256 randomWord) external;
}

interface IMockVRFV2PlusWrapper {
    function fulfillRequest(uint256 requestId) external;
}

contract FregsRandomizer is Ownable, VRFV2PlusWrapperConsumerBase {
    enum ActionType {
        NONE,
        MINT,
        CLAIM_ITEM,
        HEAD_REROLL,
        SPIN
    }

    struct PendingRequest {
        ActionType actionType;
        address requester;
        uint256 primaryId;
        uint256 secondaryId;
        string color;
    }

    uint32 public mintCallbackGasLimit = 350_000;
    uint32 public claimItemCallbackGasLimit = 300_000;
    uint32 public headRerollCallbackGasLimit = 100_000;
    uint32 public spinCallbackGasLimit = 150_000;
    uint16 public requestConfirmations = 3;
    uint32 public constant NUM_WORDS = 1;
    bool public autoFulfill;

    address public fregsContract;
    address public itemsContract;
    address public spinTheWheelContract;

    mapping(uint256 => PendingRequest) public pendingRequests;

    event RandomnessRequested(
        uint256 indexed requestId,
        ActionType indexed actionType,
        address indexed requester,
        uint256 primaryId,
        uint256 secondaryId
    );

    event RandomnessFulfilled(
        uint256 indexed requestId,
        ActionType indexed actionType,
        address indexed requester
    );

    event ContractsSet(address indexed fregsContract, address indexed itemsContract, address indexed spinTheWheelContract);
    event CallbackGasLimitsSet(
        uint32 mintCallbackGasLimit,
        uint32 claimItemCallbackGasLimit,
        uint32 headRerollCallbackGasLimit,
        uint32 spinCallbackGasLimit
    );
    event RequestConfirmationsSet(uint16 requestConfirmations);
    event AutoFulfillSet(bool autoFulfill);

    modifier onlyFregs() {
        require(msg.sender == fregsContract, "Only Fregs");
        _;
    }

    modifier onlyItems() {
        require(msg.sender == itemsContract, "Only FregsItems");
        _;
    }

    modifier onlySpinTheWheel() {
        require(msg.sender == spinTheWheelContract, "Only SpinTheWheel");
        _;
    }

    constructor(address wrapper) Ownable(msg.sender) VRFV2PlusWrapperConsumerBase(wrapper) {}

    function setContracts(address _fregsContract, address _itemsContract, address _spinTheWheelContract) external onlyOwner {
        fregsContract = _fregsContract;
        itemsContract = _itemsContract;
        spinTheWheelContract = _spinTheWheelContract;

        emit ContractsSet(_fregsContract, _itemsContract, _spinTheWheelContract);
    }

    function setCallbackGasLimits(
        uint32 _mintCallbackGasLimit,
        uint32 _claimItemCallbackGasLimit,
        uint32 _headRerollCallbackGasLimit,
        uint32 _spinCallbackGasLimit
    ) external onlyOwner {
        mintCallbackGasLimit = _mintCallbackGasLimit;
        claimItemCallbackGasLimit = _claimItemCallbackGasLimit;
        headRerollCallbackGasLimit = _headRerollCallbackGasLimit;
        spinCallbackGasLimit = _spinCallbackGasLimit;

        emit CallbackGasLimitsSet(
            _mintCallbackGasLimit,
            _claimItemCallbackGasLimit,
            _headRerollCallbackGasLimit,
            _spinCallbackGasLimit
        );
    }

    function setRequestConfirmations(uint16 _requestConfirmations) external onlyOwner {
        require(_requestConfirmations > 0, "Invalid confirmations");
        requestConfirmations = _requestConfirmations;
        emit RequestConfirmationsSet(_requestConfirmations);
    }

    function setAutoFulfill(bool _autoFulfill) external onlyOwner {
        autoFulfill = _autoFulfill;
        emit AutoFulfillSet(_autoFulfill);
    }

    function quoteMintFee() public view returns (uint256) {
        return i_vrfV2PlusWrapper.calculateRequestPriceNative(mintCallbackGasLimit, NUM_WORDS);
    }

    function quoteClaimItemFee() public view returns (uint256) {
        return i_vrfV2PlusWrapper.calculateRequestPriceNative(claimItemCallbackGasLimit, NUM_WORDS);
    }

    function quoteHeadRerollFee() public view returns (uint256) {
        return i_vrfV2PlusWrapper.calculateRequestPriceNative(headRerollCallbackGasLimit, NUM_WORDS);
    }

    function quoteSpinFee() public view returns (uint256) {
        return i_vrfV2PlusWrapper.calculateRequestPriceNative(spinCallbackGasLimit, NUM_WORDS);
    }

    function requestMint(address minter, string calldata color) external payable onlyFregs returns (uint256 requestId) {
        uint256 fee = quoteMintFee();
        require(msg.value == fee, "Incorrect VRF fee");

        requestId = _requestRandomness(mintCallbackGasLimit, fee);
        pendingRequests[requestId] = PendingRequest({
            actionType: ActionType.MINT,
            requester: minter,
            primaryId: 0,
            secondaryId: 0,
            color: color
        });

        emit RandomnessRequested(requestId, ActionType.MINT, minter, 0, 0);
        _autoFulfillIfEnabled(requestId);
    }

    function requestClaimItem(address requester, uint256 fregId) external payable onlyItems returns (uint256 requestId) {
        uint256 fee = quoteClaimItemFee();
        require(msg.value == fee, "Incorrect VRF fee");

        requestId = _requestRandomness(claimItemCallbackGasLimit, fee);
        pendingRequests[requestId] = PendingRequest({
            actionType: ActionType.CLAIM_ITEM,
            requester: requester,
            primaryId: fregId,
            secondaryId: 0,
            color: ""
        });

        emit RandomnessRequested(requestId, ActionType.CLAIM_ITEM, requester, fregId, 0);
        _autoFulfillIfEnabled(requestId);
    }

    function requestHeadReroll(address requester, uint256 itemTokenId, uint256 fregId)
        external
        payable
        onlyItems
        returns (uint256 requestId)
    {
        uint256 fee = quoteHeadRerollFee();
        require(msg.value == fee, "Incorrect VRF fee");

        requestId = _requestRandomness(headRerollCallbackGasLimit, fee);
        pendingRequests[requestId] = PendingRequest({
            actionType: ActionType.HEAD_REROLL,
            requester: requester,
            primaryId: itemTokenId,
            secondaryId: fregId,
            color: ""
        });

        emit RandomnessRequested(requestId, ActionType.HEAD_REROLL, requester, itemTokenId, fregId);
        _autoFulfillIfEnabled(requestId);
    }

    function requestSpin(address player) external payable onlySpinTheWheel returns (uint256 requestId) {
        uint256 fee = quoteSpinFee();
        require(msg.value == fee, "Incorrect VRF fee");

        requestId = _requestRandomness(spinCallbackGasLimit, fee);
        pendingRequests[requestId] = PendingRequest({
            actionType: ActionType.SPIN,
            requester: player,
            primaryId: 0,
            secondaryId: 0,
            color: ""
        });

        emit RandomnessRequested(requestId, ActionType.SPIN, player, 0, 0);
        _autoFulfillIfEnabled(requestId);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(address(this).balance >= amount, "Insufficient balance");
        to.transfer(amount);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        PendingRequest memory pending = pendingRequests[requestId];
        if (pending.actionType == ActionType.NONE) {
            return;
        }

        delete pendingRequests[requestId];

        uint256 randomWord = randomWords[0];

        if (pending.actionType == ActionType.MINT) {
            IFregsRandomMintConsumer(fregsContract).fulfillMint(pending.requester, pending.color, randomWord);
        } else if (pending.actionType == ActionType.CLAIM_ITEM) {
            IFregsItemsRandomConsumer(itemsContract).fulfillClaimItem(
                pending.requester,
                pending.primaryId,
                randomWord
            );
        } else if (pending.actionType == ActionType.HEAD_REROLL) {
            IFregsItemsRandomConsumer(itemsContract).fulfillHeadReroll(
                pending.requester,
                pending.primaryId,
                pending.secondaryId,
                randomWord
            );
        } else if (pending.actionType == ActionType.SPIN) {
            ISpinTheWheelRandomConsumer(spinTheWheelContract).fulfillSpin(pending.requester, randomWord);
        }

        emit RandomnessFulfilled(requestId, pending.actionType, pending.requester);
    }

    function _requestRandomness(uint32 callbackGasLimit, uint256 requestPrice) internal returns (uint256) {
        return requestRandomnessPayInNative(
            callbackGasLimit,
            requestConfirmations,
            NUM_WORDS,
            requestPrice,
            VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
        );
    }

    function _autoFulfillIfEnabled(uint256 requestId) internal {
        if (autoFulfill) {
            IMockVRFV2PlusWrapper(address(i_vrfV2PlusWrapper)).fulfillRequest(requestId);
        }
    }

    receive() external payable {}
}
