// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./VRFV2PlusClient.sol";

interface IVRFCoordinatorV2Plus {
    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external returns (uint256 requestId);

    function addConsumer(uint256 subId, address consumer) external;
}
