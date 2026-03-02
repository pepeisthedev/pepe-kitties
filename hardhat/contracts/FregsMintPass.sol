// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract FregsMintPass is ERC1155, ERC1155Burnable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // Token ID for the mint pass (ERC1155 can have multiple token types)
    uint256 public constant MINT_PASS = 1;

    address public fregsContract;

    string public name = "Fregs Mint Pass";
    string public symbol = "FREGMINTPASS";

    uint256 public totalMinted;

    // SpinTheWheel contract for spin wheel
    address public spinTheWheelContract;

    // Events
    event MintPassPurchased(address indexed buyer, uint256 amount);
    event MintedFromCoin(address indexed to, uint256 amount);

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}


    // ============ Burn for Mint (called by Fregs contract) ============

    function burnForMint(address holder) external {
        require(msg.sender == fregsContract, "Only Fregs contract");
        require(balanceOf(holder, MINT_PASS) >= 1, "No mint pass");
        _burn(holder, MINT_PASS, 1);
    }

    // ============ Owner Functions ============

    function setFregsContract(address _fregsContract) external onlyOwner {
        fregsContract = _fregsContract;
    }

    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }


    // Owner can mint passes for giveaways/airdrops
    function ownerMint(address to, uint256 amount) external onlyOwner {
        totalMinted += amount;
        _mint(to, MINT_PASS, amount, "");
    }

    // Mint from SpinTheWheel spin wheel
    function mintFromCoin(address to, uint256 amount) external {
        require(msg.sender == spinTheWheelContract, "Only SpinTheWheel contract");
        _mint(to, MINT_PASS, amount, "");
        emit MintedFromCoin(to, amount);
    }

    function setSpinTheWheelContract(address _spinTheWheel) external onlyOwner {
        spinTheWheelContract = _spinTheWheel;
    }

    // Owner can airdrop to multiple addresses
    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Length mismatch");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        totalMinted += totalAmount;
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], MINT_PASS, amounts[i], "");
        }
    }

    function withdraw(uint256 _amount) external onlyOwner {
        payable(owner()).transfer(_amount);
    }

    function withdrawAll() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId == MINT_PASS, "Invalid token ID");

        // If a custom URI is set, use it
        string memory baseUri = super.uri(tokenId);
        if (bytes(baseUri).length > 0) {
            return baseUri;
        }

        // Otherwise return on-chain metadata
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                _encodeMetadata()
            )
        );
    }

    function _encodeMetadata() internal view returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name": "Fregs Mint Pass",',
            '"description": "Use this pass to mint a Freg NFT during the whitelist phase!",',
            '"image": "data:image/svg+xml;base64,',
            _encodePlaceholderSVG(),
            '","attributes": [{"trait_type": "Type", "value": "Mint Pass"}]}'
        );
        return _base64Encode(json);
    }

    function _encodePlaceholderSVG() internal pure returns (string memory) {
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
            '<rect width="200" height="200" fill="#1a1a2e"/>',
            '<rect x="20" y="20" width="160" height="160" rx="20" fill="#16213e" stroke="#e94560" stroke-width="3"/>',
            '<text x="100" y="90" text-anchor="middle" fill="#e94560" font-size="16" font-weight="bold">FREGS</text>',
            '<text x="100" y="120" text-anchor="middle" fill="#fff" font-size="14">MINT PASS</text>',
            '</svg>'
        );
        return _base64Encode(svg);
    }

    // Simple base64 encoding for on-chain metadata
    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i = 0;
        uint256 j = 0;

        while (i < len) {
            uint256 a = uint256(uint8(data[i++]));
            uint256 b = i < len ? uint256(uint8(data[i++])) : 0;
            uint256 c = i < len ? uint256(uint8(data[i++])) : 0;

            uint256 triple = (a << 16) | (b << 8) | c;

            result[j++] = TABLE[(triple >> 18) & 0x3F];
            result[j++] = TABLE[(triple >> 12) & 0x3F];
            result[j++] = TABLE[(triple >> 6) & 0x3F];
            result[j++] = TABLE[triple & 0x3F];
        }

        // Add padding
        if (len % 3 == 1) {
            result[encodedLen - 1] = "=";
            result[encodedLen - 2] = "=";
        } else if (len % 3 == 2) {
            result[encodedLen - 1] = "=";
        }

        return string(result);
    }
}
