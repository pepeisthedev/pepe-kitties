// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./chainlink/VRFConsumerBaseV2Plus.sol";
import "./chainlink/IVRFCoordinatorV2Plus.sol";
import "./chainlink/VRFV2PlusClient.sol";

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

interface IMockVRFCoordinator {
    function fulfillRequest(uint256 requestId) external;
}

contract FregsRandomizer is Ownable, VRFConsumerBaseV2Plus {
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

    uint32 public mintCallbackGasLimit = 700_000;
    uint32 public claimItemCallbackGasLimit = 500_000;
    uint32 public headRerollCallbackGasLimit = 350_000;
    uint32 public spinCallbackGasLimit = 450_000;
    uint16 public requestConfirmations = 1;
    uint32 public constant NUM_WORDS = 1;
    bool public autoFulfill;

    // Subscription model config
    uint256 public subscriptionId;
    bytes32 public keyHash;

    address public fregsContract;
    address public itemsContract;
    address public spinTheWheelContract;

    mapping(uint256 => PendingRequest) public pendingRequests;
    mapping(uint256 => uint256) public storedRandomWords;
    mapping(uint256 => bool) public failedRequests;

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

    event RandomnessFailed(
        uint256 indexed requestId,
        ActionType indexed actionType,
        address indexed requester
    );

    event RandomnessRetried(
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
    event SubscriptionSet(uint256 subscriptionId, bytes32 keyHash);
    event CoordinatorSet(address coordinator);

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

    constructor(address coordinator, uint256 _subscriptionId, bytes32 _keyHash)
        Ownable(msg.sender)
        VRFConsumerBaseV2Plus(coordinator)
    {
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
    }

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

    function setSubscription(uint256 _subscriptionId, bytes32 _keyHash) external onlyOwner {
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        emit SubscriptionSet(_subscriptionId, _keyHash);
    }

    function setCoordinator(address _coordinator) external onlyOwner {
        require(_coordinator != address(0), "Invalid coordinator");
        i_vrfCoordinator = IVRFCoordinatorV2Plus(_coordinator);
        emit CoordinatorSet(_coordinator);
    }

    function requestMint(address minter, string calldata color) external onlyFregs returns (uint256 requestId) {
        requestId = _requestRandomness(mintCallbackGasLimit);
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

    function requestClaimItem(address requester, uint256 fregId) external onlyItems returns (uint256 requestId) {
        requestId = _requestRandomness(claimItemCallbackGasLimit);
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
        onlyItems
        returns (uint256 requestId)
    {
        requestId = _requestRandomness(headRerollCallbackGasLimit);
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

    function requestSpin(address player) external onlySpinTheWheel returns (uint256 requestId) {
        requestId = _requestRandomness(spinCallbackGasLimit);
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

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        PendingRequest memory pending = pendingRequests[requestId];
        if (pending.actionType == ActionType.NONE) {
            return;
        }

        uint256 randomWord = randomWords[0];
        bool success = _executeCallback(pending, randomWord);

        if (success) {
            delete pendingRequests[requestId];
            emit RandomnessFulfilled(requestId, pending.actionType, pending.requester);
        } else {
            storedRandomWords[requestId] = randomWord;
            failedRequests[requestId] = true;
            emit RandomnessFailed(requestId, pending.actionType, pending.requester);
        }
    }

    function retryFulfill(uint256 requestId) external {
        require(failedRequests[requestId], "Not a failed request");

        PendingRequest memory pending = pendingRequests[requestId];
        require(pending.actionType != ActionType.NONE, "Request not found");

        uint256 randomWord = storedRandomWords[requestId];

        delete failedRequests[requestId];
        delete storedRandomWords[requestId];
        delete pendingRequests[requestId];

        _executeCallbackOrRevert(pending, randomWord);

        emit RandomnessRetried(requestId, pending.actionType, pending.requester);
    }

    function _executeCallback(PendingRequest memory pending, uint256 randomWord) internal returns (bool) {
        if (pending.actionType == ActionType.MINT) {
            try IFregsRandomMintConsumer(fregsContract).fulfillMint(pending.requester, pending.color, randomWord) {
                return true;
            } catch { return false; }
        } else if (pending.actionType == ActionType.CLAIM_ITEM) {
            try IFregsItemsRandomConsumer(itemsContract).fulfillClaimItem(pending.requester, pending.primaryId, randomWord) {
                return true;
            } catch { return false; }
        } else if (pending.actionType == ActionType.HEAD_REROLL) {
            try IFregsItemsRandomConsumer(itemsContract).fulfillHeadReroll(pending.requester, pending.primaryId, pending.secondaryId, randomWord) {
                return true;
            } catch { return false; }
        } else if (pending.actionType == ActionType.SPIN) {
            try ISpinTheWheelRandomConsumer(spinTheWheelContract).fulfillSpin(pending.requester, randomWord) {
                return true;
            } catch { return false; }
        }
        return false;
    }

    function _executeCallbackOrRevert(PendingRequest memory pending, uint256 randomWord) internal {
        if (pending.actionType == ActionType.MINT) {
            IFregsRandomMintConsumer(fregsContract).fulfillMint(pending.requester, pending.color, randomWord);
        } else if (pending.actionType == ActionType.CLAIM_ITEM) {
            IFregsItemsRandomConsumer(itemsContract).fulfillClaimItem(pending.requester, pending.primaryId, randomWord);
        } else if (pending.actionType == ActionType.HEAD_REROLL) {
            IFregsItemsRandomConsumer(itemsContract).fulfillHeadReroll(pending.requester, pending.primaryId, pending.secondaryId, randomWord);
        } else if (pending.actionType == ActionType.SPIN) {
            ISpinTheWheelRandomConsumer(spinTheWheelContract).fulfillSpin(pending.requester, randomWord);
        }
    }

    function _requestRandomness(uint32 callbackGasLimit) internal returns (uint256) {
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
            IMockVRFCoordinator(address(i_vrfCoordinator)).fulfillRequest(requestId);
        }
    }

    // ============ View Functions ============

    function isRequestFailed(uint256 requestId) external view returns (bool) {
        return failedRequests[requestId];
    }

    function getFailedRequest(uint256 requestId)
        external
        view
        returns (
            ActionType actionType,
            address requester,
            uint256 primaryId,
            uint256 secondaryId,
            string memory color,
            uint256 randomWord
        )
    {
        require(failedRequests[requestId], "Not a failed request");
        PendingRequest memory pending = pendingRequests[requestId];
        return (
            pending.actionType,
            pending.requester,
            pending.primaryId,
            pending.secondaryId,
            pending.color,
            storedRandomWords[requestId]
        );
    }

    receive() external payable {}
}
