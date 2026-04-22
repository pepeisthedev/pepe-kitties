// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./chainlink/VRFV2PlusClient.sol";

interface IMockVRFConsumer {
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external;
}

// Mock VRF Coordinator for local testing (subscription model)
contract MockVRFV2PlusWrapper {
    uint256 public lastRequestId;

    mapping(uint256 => address) public requestConsumers;

    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata
    ) external returns (uint256 requestId) {
        lastRequestId += 1;
        requestConsumers[lastRequestId] = msg.sender;
        return lastRequestId;
    }

    function fulfillRequest(uint256 requestId) external {
        address consumer = requestConsumers[requestId];
        require(consumer != address(0), "Unknown request");

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    consumer,
                    requestId
                )
            )
        );

        delete requestConsumers[requestId];
        IMockVRFConsumer(consumer).rawFulfillRandomWords(requestId, randomWords);
    }
}
