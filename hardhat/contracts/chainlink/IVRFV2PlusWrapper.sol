// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IVRFV2PlusWrapper {
    function lastRequestId() external view returns (uint256);
    function calculateRequestPrice(uint32 callbackGasLimit, uint32 numWords) external view returns (uint256);
    function calculateRequestPriceNative(uint32 callbackGasLimit, uint32 numWords) external view returns (uint256);
    function estimateRequestPrice(
        uint32 callbackGasLimit,
        uint32 numWords,
        uint256 requestGasPriceWei
    ) external view returns (uint256);
    function estimateRequestPriceNative(
        uint32 callbackGasLimit,
        uint32 numWords,
        uint256 requestGasPriceWei
    ) external view returns (uint256);
    function requestRandomWordsInNative(
        uint32 callbackGasLimit,
        uint16 requestConfirmations,
        uint32 numWords,
        bytes calldata extraArgs
    ) external payable returns (uint256 requestId);
}
