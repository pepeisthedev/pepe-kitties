// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFregsForLiquidity {
    function ownerOf(uint256 tokenId) external view returns (address);
    function burnForLiquidity(uint256 tokenId, address sender) external;
}

contract FregsLiquidity is Ownable, ReentrancyGuard {
    IFregsForLiquidity public fregs;
    IERC20 public fregCoin;

    uint256 public constant TOTAL_SUPPLY = 3000;

    event NftBurnedAndClaimed(
        uint256 indexed tokenId,
        address indexed claimer,
        uint256 ethAmount,
        uint256 coinAmount
    );

    constructor()
        Ownable(msg.sender)
    {}

    // ============ Core ============

    function burnAndClaim(uint256 tokenId) external nonReentrant {
        require(address(fregs) != address(0), "Fregs not set");
        require(fregs.ownerOf(tokenId) == msg.sender, "Not token owner");

        uint256 ethShare = address(this).balance / TOTAL_SUPPLY;
        uint256 coinShare = address(fregCoin) != address(0)
            ? fregCoin.balanceOf(address(this)) / TOTAL_SUPPLY
            : 0;

        fregs.burnForLiquidity(tokenId, msg.sender);

        if (ethShare > 0) {
            payable(msg.sender).transfer(ethShare);
        }
        if (coinShare > 0) {
            fregCoin.transfer(msg.sender, coinShare);
        }

        emit NftBurnedAndClaimed(tokenId, msg.sender, ethShare, coinShare);
    }

    // ============ View ============

    function getRedeemAmount() external view returns (uint256 ethAmount, uint256 coinAmount) {
        ethAmount = address(this).balance / TOTAL_SUPPLY;
        coinAmount = address(fregCoin) != address(0)
            ? fregCoin.balanceOf(address(this)) / TOTAL_SUPPLY
            : 0;
    }

    // ============ Owner ============

    function depositETH() external payable onlyOwner {}

    function depositCoins(uint256 amount) external onlyOwner {
        require(address(fregCoin) != address(0), "FregCoin not set");
        fregCoin.transferFrom(msg.sender, address(this), amount);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }

    function withdrawCoins(uint256 amount) external onlyOwner {
        require(address(fregCoin) != address(0), "FregCoin not set");
        fregCoin.transfer(owner(), amount);
    }

    function setFregs(address _fregs) external onlyOwner {
        fregs = IFregsForLiquidity(_fregs);
    }

    function setFregCoin(address _fregCoin) external onlyOwner {
        fregCoin = IERC20(_fregCoin);
    }

    // Accept ETH deposits
    receive() external payable {}
}
