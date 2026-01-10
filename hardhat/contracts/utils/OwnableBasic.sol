// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract OwnableBasic is Ownable {
    function _requireCallerIsContractOwner() internal view virtual {
        _checkOwner();
    }
}
