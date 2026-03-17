// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {IVRFV2PlusWrapper} from "./IVRFV2PlusWrapper.sol";
abstract contract VRFV2PlusWrapperConsumerBase {
    error OnlyVRFWrapperCanFulfill(address have, address want);

    IVRFV2PlusWrapper public immutable i_vrfV2PlusWrapper;

    constructor(address wrapper) {
        i_vrfV2PlusWrapper = IVRFV2PlusWrapper(wrapper);
    }

    function requestRandomnessPayInNative(
        uint32 callbackGasLimit,
        uint16 requestConfirmations,
        uint32 numWords,
        uint256 requestPrice,
        bytes memory extraArgs
    ) internal returns (uint256 requestId) {
        return i_vrfV2PlusWrapper.requestRandomWordsInNative{value: requestPrice}(
            callbackGasLimit,
            requestConfirmations,
            numWords,
            extraArgs
        );
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != address(i_vrfV2PlusWrapper)) {
            revert OnlyVRFWrapperCanFulfill(msg.sender, address(i_vrfV2PlusWrapper));
        }
        fulfillRandomWords(requestId, randomWords);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal virtual;
}
