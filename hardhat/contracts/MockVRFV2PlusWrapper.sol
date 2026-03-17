// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./chainlink/IVRFV2PlusWrapper.sol";
import "./chainlink/VRFV2PlusClient.sol";

interface IMockVRFConsumer {
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external;
}

contract MockVRFV2PlusWrapper is IVRFV2PlusWrapper {
    uint256 public override lastRequestId;
    uint256 public requestPrice = 0.00005 ether;

    mapping(uint256 => address) public requestConsumers;

    function setRequestPrice(uint256 _requestPrice) external {
        requestPrice = _requestPrice;
    }

    function calculateRequestPrice(uint32, uint32) external view override returns (uint256) {
        return requestPrice;
    }

    function calculateRequestPriceNative(uint32, uint32) external view override returns (uint256) {
        return requestPrice;
    }

    function estimateRequestPrice(uint32, uint32, uint256) external view override returns (uint256) {
        return requestPrice;
    }

    function estimateRequestPriceNative(uint32, uint32, uint256) external view override returns (uint256) {
        return requestPrice;
    }

    function requestRandomWordsInNative(uint32, uint16, uint32, bytes calldata)
        external
        payable
        override
        returns (uint256 requestId)
    {
        require(msg.value >= requestPrice, "Insufficient native payment");
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
