// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./utils/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";


interface ISVGRenderer {
  function render(uint _skin, uint _head, uint _eyes, uint _lips, uint _ear, uint _smoke, uint _neck ) external view returns (string memory);
function meta(uint _trait) external view returns (string memory);
}

contract FEMPUNKS is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard  {
    using Strings for uint256;

    uint256 private _tokenIdCounter;

    ISVGRenderer SVGRenderer;

    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_
    )
        ERC721AC(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
        Ownable(address(msg.sender))
    {}


address intCon1;
address intCon2;

uint16 iniNum = 3333;


mapping(uint256 => uint256) public idSkin;
mapping(uint256 => uint256) public idHead;
mapping(uint256 => uint256) public idEar;
mapping(uint256 => uint256) public idEyes;
mapping(uint256 => uint256) public idLips;
mapping(uint256 => uint256) public idSmoke;
mapping(uint256 => uint256) public idNeck;





event canEv(address indexed sender,  uint256 indexed trait1, uint256 indexed trait2);

    function _baseURI() internal pure override returns (string memory) {
        return "data:application/json;base64,";
    }

          function setCon(address _mintpass, address _objects,  address _svgrend) public onlyOwner{
        intCon1 =  _mintpass;
        intCon2 =  _objects;
      SVGRenderer = ISVGRenderer(_svgrend);
    }    


function tokenURI(uint tokenId) public view override returns (string memory) {
  

 string memory json = Base64.encode(
  bytes(
    string(
      abi.encodePacked(
        '{',
            '"name": "LadyBead #',
        Strings.toString(tokenId),
        '",',
            '"description": "LadyBeads",',
           '"image": "data:image/svg+xml;base64,',
        Base64.encode(bytes(SVGRenderer.render(idSkin[tokenId],idHead[tokenId],idEyes[tokenId],idLips[tokenId],idEar[tokenId],idSmoke[tokenId],idNeck[tokenId]))),
        '",',
           ' "attributes": [{"trait_type": "Skin","value": "',SVGRenderer.meta(idSkin[tokenId]),'"},{"trait_type": "Head","value": "',SVGRenderer.meta(idHead[tokenId]),'"},{"trait_type": "Eyes","value": "',SVGRenderer.meta(idEyes[tokenId]),'"},{"trait_type": "Lips","value": "',SVGRenderer.meta(idLips[tokenId]),'"},{"trait_type": "Smoke","value": "',SVGRenderer.meta(idSmoke[tokenId]),'"},{"trait_type": "Neck","value": "',SVGRenderer.meta(idNeck[tokenId]),'"},{"trait_type": "Ear","value": "',SVGRenderer.meta(idEar[tokenId]),'"} ]'
        '}'
      )
    )
  )
);

  return string(abi.encodePacked(_baseURI(), json));
}

function mint(uint256 _skin, address _sender) external{
require(msg.sender == intCon1);

require(_tokenIdCounter < 3000);
uint256 newId = _tokenIdCounter;
_safeMint(_sender, 1);
_tokenIdCounter += 1;

idSkin[newId] = _skin;
idHead[newId] = 0;
idEyes[newId] = 0;
idLips[newId] = 0;
idSmoke[newId] = 0;
idNeck[newId] = 0;


}

function labDrink(uint256 tokenId, uint256 _drink, address sender) external{    
require(msg.sender == intCon2);
require(ownerOf(tokenId) == sender, "");
idSkin[tokenId] = _drink;
}

function cannibalMode(uint256 newItemId, uint256 tokenIdEaten) public nonReentrant {
    require(ownerOf(newItemId) == msg.sender && ownerOf(tokenIdEaten) == msg.sender, "");
  //  require(idNeck[newItemId] > 0, "");
    _burn(tokenIdEaten);
    uint256 random = uint256(keccak256(abi.encodePacked(iniNum++))) % 10000;

   
    if (idHead[newItemId] < 1) {
        uint256[17] memory thresholds = [uint256(200), uint256(500), uint256(800), uint256(1800), uint256(1900), uint256(2200), uint256(2500), uint256(3000), uint256(3500), uint256(4000), uint256(4300), uint256(4600), uint256(5500), uint256(5800), uint256(7300), uint256(8500), uint256(10000)];
        uint256[17] memory heads = [uint256(1), uint256(2), uint256(3), uint256(4), uint256(5), uint256(6), uint256(7), uint256(8), uint256(9), uint256(10), uint256(11), uint256(12), uint256(13), uint256(14), uint256(15), uint256(17), uint256(18)];
        for (uint i; i < thresholds.length; i++) {
            if (random <= thresholds[i]) {
                idHead[newItemId] = heads[i];
                break;
            }
        }
      
        emit canEv(msg.sender, idHead[newItemId], 0);
    } else if (idEyes[newItemId] < 1 && idHead[newItemId] > 0) {
        uint256[10] memory eyeThresholds = [uint256(600), uint256(1200), uint256(1800), uint256(2300), uint256(2800), uint256(3300), uint256(4000), uint256(6000), uint256(8000), uint256(10000)];
        uint256[10] memory eyes = [uint256(19), uint256(20), uint256(21), uint256(22), uint256(23), uint256(24), uint256(25), uint256(26), uint256(27), uint256(28)];
        for (uint i; i < eyeThresholds.length; i++) {
            if (random <= eyeThresholds[i]) {
                idEyes[newItemId] = eyes[i];
                break;
            }
        }
       
        emit canEv(msg.sender, idEyes[newItemId], 0);
    } else if (idLips[newItemId] < 1 && idEyes[newItemId] > 0) {
        idLips[newItemId] = random <= 3000 ? 32 : random <= 7000 ? 31 : 30;
        idSmoke[newItemId] = random <= 1000 ? 33 : random <= 7500 ? 36 : random <= 9000 ? 35 : 34;
      
        emit canEv(msg.sender, idLips[newItemId], idSmoke[newItemId]);
    } else if (idEar[newItemId] < 1 && idLips[newItemId] > 0) {
        idEar[newItemId] = random <= 2500 ? 37 : random <= 8000 ? 38 : 37;
        idNeck[newItemId] = random <= 2000 ? 39 : random <= 7000 ? 41 : 40;
       
        emit canEv(msg.sender, idEar[newItemId], idNeck[newItemId]);
    }
}



    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721AC, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _requireCallerIsContractOwner() internal view override {
        _checkOwner();
    }

}