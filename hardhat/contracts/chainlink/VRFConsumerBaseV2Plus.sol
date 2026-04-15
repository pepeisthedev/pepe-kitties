// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {IVRFCoordinatorV2Plus} from "./IVRFCoordinatorV2Plus.sol";

abstract contract VRFConsumerBaseV2Plus {
    error OnlyCoordinatorCanFulfill(address have, address want);

    IVRFCoordinatorV2Plus public i_vrfCoordinator;

    constructor(address coordinator) {
        i_vrfCoordinator = IVRFCoordinatorV2Plus(coordinator);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != address(i_vrfCoordinator)) {
            revert OnlyCoordinatorCanFulfill(msg.sender, address(i_vrfCoordinator));
        }
        fulfillRandomWords(requestId, randomWords);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal virtual;
}
