// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FregsAirdrop is Ownable, ReentrancyGuard {
    IERC20 public fregCoin;
    address public fregs;

    event AirdropBatch(uint256 recipientCount, uint256 totalAmount);
    event AirdropFunded(uint256 amount);

    constructor() Ownable(msg.sender) {}

    function fundAirdrop(uint256 amount) external onlyOwner {
        require(address(fregCoin) != address(0), "FregCoin not set");
        fregCoin.transferFrom(msg.sender, address(this), amount);
        emit AirdropFunded(amount);
    }

    function airdropBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "Empty batch");
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            fregCoin.transfer(recipients[i], amounts[i]);
            totalAmount += amounts[i];
        }
        emit AirdropBatch(recipients.length, totalAmount);
    }

    function withdrawRemainder(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 balance = fregCoin.balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        fregCoin.transfer(to, balance);
    }

    function coinBalance() external view returns (uint256) {
        return fregCoin.balanceOf(address(this));
    }

    function setFregCoin(address _fregCoin) external onlyOwner {
        require(_fregCoin != address(0), "Invalid address");
        fregCoin = IERC20(_fregCoin);
    }

    function setFregs(address _fregs) external onlyOwner {
        require(_fregs != address(0), "Invalid address");
        fregs = _fregs;
    }

}
