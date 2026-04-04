// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFregsRandomizer {
    function quoteMintFee() external view returns (uint256);
    function quoteClaimItemFee() external view returns (uint256);
    function quoteHeadRerollFee() external view returns (uint256);
    function quoteSpinFee() external view returns (uint256);

    function requestMint(address minter, string calldata color) external payable returns (uint256);
    function requestClaimItem(address requester, uint256 fregId) external payable returns (uint256);
    function requestHeadReroll(address requester, uint256 itemTokenId, uint256 fregId) external payable returns (uint256);
    function requestSpin(address player) external payable returns (uint256);

    function retryFulfill(uint256 requestId) external;
    function isRequestFailed(uint256 requestId) external view returns (bool);
}
