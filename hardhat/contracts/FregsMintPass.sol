// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IFregs {
    function freeMint(string memory _color, address _sender) external;
}

contract FregsMintPass is ERC1155, ERC1155Burnable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // Token ID for the mint pass (ERC1155 can have multiple token types)
    uint256 public constant MINT_PASS = 1;

    IFregs public fregs;

    string public name = "Fregs Mint Pass";
    string public symbol = "FREGMINTPASS";

    // Mint pass configuration
    uint256 public mintPassPrice = 0.0005 ether;
    uint256 public maxMintPasses = 1000;
    uint256 public totalMinted;
    bool public mintPassSaleActive = false;

    // SpinTheWheel contract for spin wheel
    address public spinTheWheelContract;

    // Events
    event MintPassPurchased(address indexed buyer, uint256 amount);
    event FregMinted(address indexed user, string color);
    event MintedFromCoin(address indexed to, uint256 amount);

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    // ============ Mint Pass Purchase ============

    function purchaseMintPass(uint256 amount) external payable nonReentrant {
        require(mintPassSaleActive, "Mint pass sale not active");
        require(amount > 0, "Amount must be greater than 0");
        require(totalMinted + amount <= maxMintPasses, "Exceeds max mint passes");
        require(msg.value >= mintPassPrice * amount, "Insufficient funds");

        totalMinted += amount;
        _mint(msg.sender, MINT_PASS, amount, "");

        emit MintPassPurchased(msg.sender, amount);
    }

    // ============ Use Mint Pass to Mint Freg ============

    function mintFreg(string memory _color) external nonReentrant {
        require(balanceOf(msg.sender, MINT_PASS) >= 1, "No mint pass");
        require(address(fregs) != address(0), "Fregs not set");

        // Burn the mint pass
        _burn(msg.sender, MINT_PASS, 1);

        // Call freeMint on Fregs contract
        fregs.freeMint(_color, msg.sender);

        emit FregMinted(msg.sender, _color);
    }

    // Batch mint multiple fregs at once
    function mintFregBatch(string[] memory _colors) external nonReentrant {
        uint256 amount = _colors.length;
        require(amount > 0, "Must mint at least 1");
        require(balanceOf(msg.sender, MINT_PASS) >= amount, "Not enough mint passes");
        require(address(fregs) != address(0), "Fregs not set");

        // Burn the mint passes
        _burn(msg.sender, MINT_PASS, amount);

        // Mint each freg
        for (uint256 i = 0; i < amount; i++) {
            fregs.freeMint(_colors[i], msg.sender);
            emit FregMinted(msg.sender, _colors[i]);
        }
    }

    // ============ Owner Functions ============

    function setFregs(address _fregs) external onlyOwner {
        fregs = IFregs(_fregs);
    }

    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }

    function setMintPassPrice(uint256 _price) external onlyOwner {
        mintPassPrice = _price;
    }

    function setMaxMintPasses(uint256 _max) external onlyOwner {
        maxMintPasses = _max;
    }

    function setMintPassSaleActive(bool _active) external onlyOwner {
        mintPassSaleActive = _active;
    }

    // Owner can mint passes for giveaways/airdrops
    function ownerMint(address to, uint256 amount) external onlyOwner {
        require(totalMinted + amount <= maxMintPasses, "Exceeds max mint passes");
        totalMinted += amount;
        _mint(to, MINT_PASS, amount, "");
    }

    // Mint from SpinTheWheel spin wheel
    function mintFromCoin(address to, uint256 amount) external {
        require(msg.sender == spinTheWheelContract, "Only SpinTheWheel contract");
        require(totalMinted + amount <= maxMintPasses, "Exceeds max mint passes");
        totalMinted += amount;
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
        require(totalMinted + totalAmount <= maxMintPasses, "Exceeds max mint passes");

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

    // ============ View Functions ============

    function mintPassesRemaining() external view returns (uint256) {
        return maxMintPasses - totalMinted;
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
            '"description": "Use this pass to mint a free Freg NFT with your chosen color!",',
            '"image": "data:image/svg+xml;base64,',
            _encodePlaceholderSVG(),
            '","attributes": [{"trait_type": "Type", "value": "Mint Pass"},',
            '{"trait_type": "Remaining", "value": "',
            (maxMintPasses - totalMinted).toString(),
            '"}]}'
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
