// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISVGitems {function render(uint _object) external view returns (string memory);}

interface IFEMPUNKS {
    function labDrink(uint256 tokenId, uint256 _drink, address sender) external;
}

contract LAB is ERC721URIStorage, ReentrancyGuard, Ownable {
    using Strings for uint256;

    uint256 private _tokenIdCounter;

bool public pause = false;
address interContract1;
address interContract2;

    
    mapping(uint256 => uint256) public tokenIdDrink;
    mapping(uint256 => string) public metaDrink;

uint128 initialNumber = 3333;

//EVENTS
event mintingEvent(address indexed sender, uint256 indexed tokenId);
event Equip(address indexed sender);
// EVENTS

ISVGitems SVGitems;

    constructor()
        ERC721("Serum Shop", "SHOP")
        Ownable(address(msg.sender))
    {}

  function setContractsSVGrend(address _svgrend) public onlyOwner{
        SVGitems = ISVGitems(_svgrend);

    } 

//Set interaction adress - Items
  function setContract2(address _beads, address _punks) public onlyOwner{
        interContract2 =  _beads;
        interContract1 =  _punks;


      
    }   

function _baseURI() internal pure override returns (string memory) {
  return "data:application/json;base64,";
}


function tokenURI(uint tokenId) public view override returns (string memory) {
  

 string memory json = Base64.encode(
  bytes(
    string(
      abi.encodePacked(
        '{',
            '"name": "',metaDrink[tokenId],'",',
            '"description": "Something made of Beads",',
           '"image": "data:image/svg+xml;base64,',
       Base64.encode(bytes(SVGitems.render(tokenIdDrink[tokenId]))),
        '",',
           ' "attributes": [{"trait_type": "Object","value": "',metaDrink[tokenId],'"} ]'
        '}'
      )
    )
  )
);

  return string(abi.encodePacked(_baseURI(), json));
}


//Mint
function mint(uint256 _object, address _sender) external {
  require(msg.sender == interContract2);

uint256 drinkID;
    string memory objecttype; 


if (_object == 1){
    objecttype = "Zombie Virus";
    drinkID = 45;
}
else if (_object == 2){
    objecttype = "No-Drink";
    drinkID = 47;
}
else if (_object == 3){
    objecttype = "Jungle Juice";
    drinkID = 46;
}

else {
    objecttype = "Alien DNA";
    drinkID = 48;
}

uint256 newItemId = _tokenIdCounter;
_tokenIdCounter += 1;
_safeMint(_sender, newItemId);
tokenIdDrink[newItemId] = drinkID;
metaDrink[newItemId] = objecttype;

emit mintingEvent(_sender, tokenIdDrink[newItemId]);
}


function callequipTrait(uint256 punkId, uint256 _object) public nonReentrant{
    uint256 drinkType = tokenIdDrink[_object];
    _burn(_object);
    IFEMPUNKS(interContract1).labDrink(punkId, drinkType, msg.sender);
}


}