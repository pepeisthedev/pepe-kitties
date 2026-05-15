// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal rescuer intended to be deployed at an address where ETH was
/// sent by mistake (e.g. users minting on the wrong chain). Must be deployed
/// via CREATE by the same EOA + nonce that produced the target address on the
/// other chain.
///
/// Intentionally does NOT revert in the constructor: a failed constructor still
/// burns the nonce, which would waste our one shot at that address.
contract FregsRescue {
    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function sweep(address payable to) external {
        require(msg.sender == owner, "not owner");
        require(to != address(0), "zero recipient");
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "sweep failed");
    }

    receive() external payable {}
}
