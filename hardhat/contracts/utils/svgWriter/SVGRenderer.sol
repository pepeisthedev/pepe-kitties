// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SSTORE2.sol";

contract SVGRenderer is Ownable {
    address[25] public partPointers;
    uint256 public activePartCount; 
    
    constructor(address[] memory _parts) Ownable(address(msg.sender)) {
        activePartCount = _parts.length;
        unchecked {
            for (uint256 i; i < _parts.length; ++i) {
                partPointers[i] = _parts[i];
            }
        }
    }
    
    /**
     * Most optimized render function
     * - Uses unchecked for gas savings
     * - Pre-increments in loops
     * - Single assembly block for all memory operations
     * - Efficient 32-byte chunk copying with remainder handling
     */
    function render() public view returns (string memory) {
        uint256 count = activePartCount;
        
        // Read all parts and calculate total length
        bytes[] memory parts = new bytes[](count);
        uint256 totalLength;
        
        unchecked {
            for (uint256 i; i < count; ++i) {
                parts[i] = SSTORE2.read(partPointers[i]);
                totalLength += parts[i].length;
            }
        }
        
        // Single assembly block for maximum efficiency
        bytes memory result;
        assembly {
            // Allocate result
            result := mload(0x40)
            mstore(result, totalLength)
            let resultData := add(result, 0x20)
            mstore(0x40, add(resultData, totalLength))
            
            let offset := 0
            let partsPtr := add(parts, 0x20)
            
            // Iterate through all parts
            for { let i := 0 } lt(i, count) { i := add(i, 1) } {
                // Load part from array
                let part := mload(add(partsPtr, mul(i, 0x20)))
                let partLen := mload(part)
                
                // Source and destination pointers
                let src := add(part, 0x20)
                let dest := add(resultData, offset)
                
                // Copy in 32-byte chunks (unrolled for small counts)
                let remaining := partLen
                
                // Fast path: copy full 32-byte words
                for { } iszero(lt(remaining, 0x20)) { } {
                    mstore(dest, mload(src))
                    src := add(src, 0x20)
                    dest := add(dest, 0x20)
                    remaining := sub(remaining, 0x20)
                }
                
                // Handle last partial word if any
                if remaining {
                    // Create mask for remaining bytes
                    let mask := not(sub(shl(mul(8, sub(0x20, remaining)), 1), 1))
                    // Copy only the needed bytes
                    mstore(dest, and(mload(src), mask))
                }
                
                offset := add(offset, partLen)
            }
        }
        
        return string(result);
    }
    
    // Debug functions
    function getChunk(uint256 index) external view returns (string memory) {
        require(index < activePartCount, "Index out of range");
        return string(SSTORE2.read(partPointers[index]));
    }
    
    function getChunkInfo(uint256 index) external view returns (address pointer, uint256 length) {
        require(index < activePartCount, "Index out of range");
        pointer = partPointers[index];
        bytes memory chunk = SSTORE2.read(pointer);
        length = chunk.length;
    }
    
    function getTotalSize() external view returns (uint256 total) {
        unchecked {
            for (uint256 i; i < activePartCount; ++i) {
                total += SSTORE2.read(partPointers[i]).length;
            }
        }
    }
    
    function setParts(address[] memory _parts) external onlyOwner {
        require(_parts.length <= 25, "Too many parts");
        
        uint256 oldCount = activePartCount;
        activePartCount = _parts.length;
        
        unchecked {
            // Clear old parts
            for (uint256 i; i < oldCount; ++i) {
                partPointers[i] = address(0);
            }
            // Set new parts
            for (uint256 i; i < _parts.length; ++i) {
                partPointers[i] = _parts[i];
            }
        }
    }
    
    function getPartCount() external view returns (uint256) {
        return activePartCount;
    }
}
